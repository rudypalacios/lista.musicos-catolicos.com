import { api, ApiError } from '../api.ts';
import type { App } from '../app.ts';
import { describeGuestWork, hasGuestWork, isGuest } from '../guest.ts';
import { h } from '../dom.ts';
import { paths } from '../router.ts';
import { showToast } from '../toast.ts';
import { chooseDialog } from '../views/confirm-dialog.ts';
import { forgotView } from '../views/forgot.ts';
import type { InstallBanner } from '../views/install-banner.ts';
import { signInView } from '../views/signin.ts';
import { signUpView } from '../views/signup.ts';
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
                showSignIn({
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

    /** The sign-in form, with "Olvidé mi contraseña" (which comes back here) and, if given, a way back */
    const showSignIn = (options: { onSignedIn: (email: string) => void; message?: string; onCancel?: () => void }): void => {
        screen.show(signInView({
            ...options,
            onForgot: () => screen.show(forgotView({ onBack: () => showSignIn(options) })),
        }));
    };

    /**
     * The person with no account has signed in or signed up, so there is a session. If they wrote anything, they choose:
     * keep it (it joins the account), drop it, or cancel (nothing is decided for them: the session just made is ended and
     * they go on as they were). With nothing written there is nothing to ask.
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
            showApp();

            return 'cancelled';
        }
        if (answer === 'keep') {
            await data.adoptKeepingGuestWork(email);

            return 'kept';
        }
        await data.adopt(email);

        return 'dropped';
    };

    /** Shows the sign-in form over the app of a person with no account; "Volver" gives the app back */
    const signInFromGuest = (): void => {
        showSignIn({
            onSignedIn: (email) => void finishGuestSignIn(email).catch(report),
            onCancel: () => showApp(),
        });
    };

    const finishGuestSignIn = async (email: string): Promise<void> => {
        const choice = await adoptGuestWork(email, 'sign-in');
        if (choice === 'cancelled') {
            return;
        }
        if (choice === 'dropped') {
            // The screen the person was on may show something that was just dropped: they start from the songs
            history.replaceState(null, '', paths.list());
        }
        enter(email);
        data.requestSync(0);
    };

    /** The sign-up form over the app of a person with no account; "Volver" gives the app back */
    const signUpFromGuest = (): void => {
        screen.show(signUpView({
            onCreated: (email, mailSent) => void finishSignUp(email, mailSent, true).catch(report),
            onSignIn: signInFromGuest,
            onCancel: () => showApp(),
        }));
    };

    /** The account exists and its session is open: take what the device holds (if it was a guest's), and land on the page that says the link went out */
    const finishSignUp = async (email: string, mailSent: boolean, wasGuest: boolean): Promise<void> => {
        if (wasGuest) {
            if ((await adoptGuestWork(email, 'sign-up')) === 'cancelled') {
                return;
            }
        } else {
            await data.adopt(email);
        }
        history.replaceState(null, '', paths.checkMail(mailSent));
        enter(email);
        data.requestSync(0);
    };

    /** What a device with nothing on it and no session shows: try the app, create an account, or sign in */
    const showWelcome = (message?: string): void => {
        const again = (): void => showWelcome(message);
        screen.show(welcomeView({
            onTry: () => {
                void data.startGuest().then(enterGuest);
            },
            onSignIn: () => {
                showSignIn({
                    onSignedIn: (email) => {
                        void data.adopt(email).then(() => {
                            enter(email);
                            data.requestSync(0);
                        });
                    },
                    onCancel: again,
                });
            },
            onSignUp: () => {
                screen.show(signUpView({
                    onCreated: (email, mailSent) => void finishSignUp(email, mailSent, false).catch(report),
                    onSignIn: () => showSignIn({
                        onSignedIn: (signedIn) => {
                            void data.adopt(signedIn).then(() => {
                                enter(signedIn);
                                data.requestSync(0);
                            });
                        },
                        onCancel: again,
                    }),
                    onCancel: again,
                }));
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

    const begin = async (): Promise<void> => {
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

        root.replaceChildren(
            h('header', { class: 'bar' }, h('h1', {}, 'Listas')),
            h('main', { id: 'view' }, splash('Conectando…')),
            installBanner.element,
        );
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

    return { begin };
}
