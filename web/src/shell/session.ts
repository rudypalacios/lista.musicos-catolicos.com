import { api, ApiError, type Me } from '../api.ts';
import type { App } from '../app.ts';
import { GOOGLE_PROBLEMS, readGoogleReturn, type GoogleReturn } from '../google-return.ts';
import { describeGuestWork, hasGuestWork, isGuest } from '../guest.ts';
import { h } from '../dom.ts';
import { paths } from '../router.ts';
import { showToast } from '../toast.ts';
import { chooseDialog } from '../views/confirm-dialog.ts';
import { forgotView } from '../views/forgot.ts';
import type { InstallBanner } from '../views/install-banner.ts';
import { accessView, type AccessMode } from '../views/access.ts';
import { showKeepAccount } from '../views/keep-account.ts';
import { welcomeView } from '../views/welcome.ts';
import type { Frame } from './frame.ts';
import { splash, type Screen } from './screen.ts';

/** What the session needs from the rest of the shell */
export interface SessionParts {
    root: HTMLElement;
    data: App;
    screen: Screen;
    frame: Frame;
    installBanner: InstallBanner;
    /** Starts the page's navigation the first time the app is shown, and draws the current screen again after that */
    showApp: () => void;
}

/** Who is using the app, and the ways in and out: the welcome, signing in, signing up, trying with no account, and signing out */
export interface Session {
    /** Opens the app for whoever this device belongs to, or asks who is there */
    begin: () => Promise<void>;
}

/** What the person with no account wrote is asked about when they sign in or sign up: the words differ, the choice is the same */
type Moment = 'sign-in' | 'sign-up';

/** What the person chose to do with what they wrote with no account */
type GuestChoice = 'kept' | 'dropped' | 'cancelled';

const WORDS: Record<Moment, { text: string; keep: string; drop: string }> = {
    'sign-in': {
        text: 'Los escribiste sin cuenta. Puedes sumarlos a tu cuenta (se agregan a lo que ya tienes) o descartarlos (se borran de este dispositivo y queda solo lo de tu cuenta).',
        keep: 'Sumarlos a mi cuenta',
        drop: 'Descartarlos',
    },
    'sign-up': {
        text: 'Los escribiste antes de crear tu cuenta. Puedes traerlos a tu cuenta (los tendrás en todos tus dispositivos) o empezar desde cero (se borran de este dispositivo y tu cuenta empieza vacía).',
        keep: 'Traerlos a mi cuenta',
        drop: 'Empezar desde cero',
    },
};

/**
 * The session: decides what the person sees first and what signing in, signing up or out does. A device that already holds
 * someone's songs opens from them at once, with no network (whether the session is still good is found out in the background);
 * a guest's opens the same way; only a device with nothing on it has to ask the server who is there.
 */
export function createSession(parts: SessionParts): Session {
    const { root, data, screen, frame, installBanner, showApp } = parts;

    /** Shows the app for a signed-in person (or one whose songs this device holds, when offline) */
    const enter = (email: string): void => {
        frame.mount({
            email,
            onSignedOut: () => {
                // Salir is in Ajustes: whoever signs in next starts from the songs, not from that screen
                history.replaceState(null, '', paths.list());
                void begin();
            },
            onNeedsSignIn: () => {
                showAccess({
                    mode: 'sign-in',
                    message: 'Tu sesión terminó. Inicia sesión para seguir sincronizando; tus cantos siguen aquí.',
                    onSignedIn: (signedIn) => {
                        void data.adopt(signedIn).then(() => {
                            enter(signedIn);
                            data.resumed();
                        });
                    },
                });
            },
            onSignUp: () => undefined,
        });
        showApp();
    };

    /**
     * Shows the app for a person with no account: their songs are on this device and nothing is synced. The bar's dot and
     * its line say so and offer to create an account, and Ajustes also offers to sign in; both ask what to do with what
     * was written (see `adoptGuestWork`).
     */
    const enterGuest = (): void => {
        frame.mount({
            email: null,
            onSignedOut: () => undefined,
            onNeedsSignIn: signInFromGuest,
            onSignUp: signUpFromGuest,
        });
        showApp();
    };

    const report = (failure: unknown): void => {
        showToast(failure instanceof Error ? failure.message : 'No se pudo completar. Inténtalo de nuevo.');
    };

    /**
     * A session was just opened: if the account asked to be deleted and its 3 days are not up, the person is offered to keep it
     * (`keepAccountView`) before `proceed` opens anything. "Seguir con la eliminación" ends the session and runs `leave`. If the server
     * cannot be asked (no connection right after signing in) it goes on: the sync finds out and says so.
     */
    const guardPending = async (proceed: () => void, leave: () => void): Promise<void> => {
        let deleteAfter: number | null = null;
        try {
            deleteAfter = (await api.me()).deleteAfter ?? null;
        } catch {
            // Nothing to offer without an answer
        }
        if (deleteAfter === null) {
            proceed();

            return;
        }
        showKeepAccount({
            deleteAfter,
            onKeep: proceed,
            onLeave: () => void api.logout().catch(() => undefined).then(leave),
        });
    };

    /**
     * The screen to get in with an email: "Entrar" and "Crear cuenta" as two tabs of one screen, with Google on top. `onCreated`
     * is what offers the second tab (a session that ended can only sign in); "Olvidé mi contraseña" comes back to the first.
     */
    const showAccess = (request: {
        mode: AccessMode;
        onSignedIn: (email: string) => void;
        onCreated?: (email: string, mailSent: boolean) => void;
        message?: string;
        onCancel?: () => void;
    }): void => {
        // An account that asked to be deleted and is in its 3 days is offered to keep, before anything else of the app opens; if the
        // person goes on with the deletion they are where they were (the way back of this screen, or this screen again)
        const signedIn = (email: string): void => void guardPending(() => request.onSignedIn(email), request.onCancel ?? (() => showAccess(request)));
        screen.show(accessView({
            mode: request.mode,
            signIn: {
                onSignedIn: signedIn,
                ...(request.message === undefined ? {} : { message: request.message }),
                onForgot: () => screen.show(forgotView({ onBack: () => showAccess({ ...request, mode: 'sign-in' }) })),
            },
            ...(request.onCreated === undefined ? {} : { signUp: { onCreated: request.onCreated } }),
            ...(request.onCancel === undefined ? {} : { onCancel: request.onCancel }),
        }));
    };

    /**
     * The person with no account has signed in or signed up, so there is a session. If they wrote anything, they choose:
     * keep it (it joins the account), drop it, or cancel (nothing is decided for them: the session just made is ended and
     * they go on as they were: the caller draws the app again). With nothing written there is nothing to ask.
     */
    const adoptGuestWork = async (email: string, moment: Moment): Promise<GuestChoice> => {
        const work = await data.guestWork();
        if (!hasGuestWork(work)) {
            await data.adopt(email);

            return 'dropped';
        }
        const words = WORDS[moment];
        const answer = await chooseDialog<'keep' | 'drop'>({
            title: `Tienes ${describeGuestWork(work)} en este dispositivo`,
            text: words.text,
            cancel: 'Cancelar',
            choices: [
                { label: words.keep, value: 'keep', kind: 'primary' },
                { label: words.drop, value: 'drop', kind: 'danger' },
            ],
        });
        if (answer === null) {
            await api.logout().catch(() => undefined);
            if (moment === 'sign-up') {
                showToast('Tu cuenta quedó creada. Inicia sesión cuando quieras.', 5000);
            }

            return 'cancelled';
        }
        if (answer === 'keep') {
            await data.adoptKeepingGuestWork(email);

            return 'kept';
        }
        await data.adopt(email);

        return 'dropped';
    };

    /**
     * The access screen (Entrar / Crear cuenta) over the app of a person with no account; "Volver" gives the app back. Whichever
     * tab they use, what they wrote with no account is asked about (see `adoptGuestWork`).
     */
    const accessFromGuest = (mode: AccessMode): void => {
        showAccess({
            mode,
            onSignedIn: (email) => void finishGuestSignIn(email).catch(report),
            onCreated: (email, mailSent) => void finishSignUp(email, mailSent, true).catch(report),
            onCancel: () => showApp(),
        });
    };
    const signInFromGuest = (): void => accessFromGuest('sign-in');

    const finishGuestSignIn = async (email: string): Promise<void> => {
        const choice = await adoptGuestWork(email, 'sign-in');
        if (choice === 'cancelled') {
            showApp();

            return;
        }
        if (choice === 'dropped') {
            // The screen the person was on may show something that was just dropped: they start from the songs
            history.replaceState(null, '', paths.list());
        }
        enter(email);
        data.requestSync(0);
    };

    const signUpFromGuest = (): void => accessFromGuest('sign-up');

    /** The account exists and its session is open: take what the device holds (if it was a guest's), and land on the page that says the link went out */
    const finishSignUp = async (email: string, mailSent: boolean, wasGuest: boolean): Promise<void> => {
        if (wasGuest) {
            if ((await adoptGuestWork(email, 'sign-up')) === 'cancelled') {
                showApp();

                return;
            }
        } else {
            await data.adopt(email);
        }
        history.replaceState(null, '', paths.checkMail(mailSent));
        enter(email);
        data.requestSync(0);
    };

    /** What a device with nothing on it and no session shows: Google, an email (to sign in or to create the account), or try the app */
    const showWelcome = (message?: string): void => {
        screen.show(welcomeView({
            onTry: () => {
                void data.startGuest().then(enterGuest);
            },
            onEmail: () => {
                showAccess({
                    mode: 'sign-in',
                    onSignedIn: (email) => {
                        void data.adopt(email).then(() => {
                            enter(email);
                            data.requestSync(0);
                        });
                    },
                    onCreated: (email, mailSent) => void finishSignUp(email, mailSent, false).catch(report),
                    onCancel: () => showWelcome(message),
                });
            },
            ...(message === undefined ? {} : { message }),
        }));
    };

    /** The person is already in; ask the server whether that is still true, and sync */
    const verifySession = async (owner: string): Promise<void> => {
        try {
            const me = await api.me();
            if (me.email !== owner) {
                // Another account signed in on this device elsewhere: its songs replace these
                await data.adopt(me.email);
                enter(me.email);
            }
            data.requestSync(0);
        } catch {
            // Offline, a stuck network, or the session ended: syncing reports which, in the header,
            // and the songs on the device stay readable either way
            data.requestSync(0);
        }
    };

    /** What a device with nothing on it shows while it asks the server who is there */
    const showConnecting = (): void => {
        // The page of a person who is not in yet: a bar and a screen, stacked (the rail of the app is not there; see `.is-gate`)
        root.classList.add('is-gate');
        root.replaceChildren(
            h('header', { class: 'bar' }, h('h1', {}, 'Listas')),
            h('main', { id: 'view' }, splash('Conectando…')),
            installBanner.element,
        );
    };

    /**
     * The person came back from Google and the server opened their session (see `GoogleReturn.php`): this device takes the
     * account the same way as after a password. Whoever wrote songs with no account is asked what to do with them (a
     * sign-up if Google just made the account, a sign-in if it was there). Returns false when it could not tell who signed
     * in, and nothing was changed.
     */
    const finishGoogle = async (created: boolean): Promise<boolean> => {
        const owner = await data.owner();
        showConnecting();
        let me: Me;
        try {
            me = await api.me();
        } catch {
            return false;
        }
        const email = me.email;

        const goOn = async (): Promise<void> => {
            if (isGuest(owner)) {
                await data.startGuest();
                const choice = await adoptGuestWork(email, created ? 'sign-up' : 'sign-in');
                if (choice === 'cancelled') {
                    enterGuest();

                    return;
                }
                if (choice === 'dropped') {
                    history.replaceState(null, '', paths.list());
                }
            } else if (owner !== email) {
                await data.adopt(email);
            }
            enter(email);
            data.requestSync(0);
        };
        if (me.deleteAfter !== undefined && me.deleteAfter !== null) {
            // It asked to be deleted: keep it, or go on and end this session
            showKeepAccount({
                deleteAfter: me.deleteAfter,
                onKeep: () => void goOn().catch(report),
                onLeave: () => void api.logout().catch(() => undefined).then(() => open()),
            });

            return true;
        }
        await goOn();

        return true;
    };

    /** Reads the word of the return from Google out of the address (and takes it out of it, so a reload does not repeat it) */
    const takeGoogleReturn = (): GoogleReturn | null => {
        const read = readGoogleReturn(location.search);
        if (read === null) {
            return null;
        }
        history.replaceState(null, '', location.pathname + read.rest + location.hash);

        return read.result;
    };

    /** Opens the app for whoever this device belongs to, or asks who is there */
    const open = async (): Promise<void> => {
        const owner = await data.owner();
        if (isGuest(owner)) {
            // No account: nothing to ask the server, so it opens at once, online or not
            await data.startGuest();
            enterGuest();

            return;
        }
        if (owner !== null) {
            enter(owner);
            void verifySession(owner);

            return;
        }

        showConnecting();
        try {
            const me = await api.me();
            await data.adopt(me.email);
            enter(me.email);
            data.requestSync(0);
        } catch (failure: unknown) {
            // No session on a device with nothing on it: the app is open to try; signing in needs a connection
            const offline = failure instanceof ApiError && failure.isOffline;
            showWelcome(offline ? 'Sin conexión: puedes probar la app; para iniciar sesión necesitas conexión.' : undefined);
        }
    };

    const begin = async (): Promise<void> => {
        const back = takeGoogleReturn();
        if (back?.kind === 'signed-in') {
            if (await finishGoogle(back.created)) {
                return;
            }
            await open();
            showToast(GOOGLE_PROBLEMS.failed, 6000);

            return;
        }
        await open();
        if (back?.kind === 'problem') {
            showToast(back.message, 6000);
        }
    };

    return { begin };
}
