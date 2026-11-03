import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emailProblem, passwordProblem } from '../src/account.ts';

describe('emailProblem', () => {
    it('asks for the shape of an address, nothing the server would have to refuse for a reason the person cannot see', () => {
        assert.equal(emailProblem('ana@example.com'), null);
        assert.equal(emailProblem('  ana@example.com '), null);
        assert.equal(emailProblem('a.b+c@mail.example.org'), null);
        assert.equal(emailProblem(''), 'Escribe tu correo.');
        for (const bad of ['ana', 'ana@', '@example.com', 'ana@example', 'an a@example.com', 'a@@b.co']) {
            assert.equal(emailProblem(bad), 'Escribe un correo válido.', bad);
        }
        assert.equal(emailProblem(`${'a'.repeat(190)}@example.com`), 'Escribe un correo válido.');
    });
});

describe('passwordProblem', () => {
    it('wants 10 characters, counted as the person sees them', () => {
        assert.match(passwordProblem('corta') ?? '', /al menos 10/);
        assert.equal(passwordProblem('123456789'), 'La contraseña necesita al menos 10 caracteres.');
        assert.equal(passwordProblem('1234567890'), null);
        // Ten letters with accents are ten characters, though they take more bytes
        assert.equal(passwordProblem('ñandúñandú'), null);
    });

    it('refuses what the server\'s hash would cut: more than 72 bytes', () => {
        assert.equal(passwordProblem('a'.repeat(72)), null);
        assert.match(passwordProblem('a'.repeat(73)) ?? '', /demasiado larga/);
        assert.match(passwordProblem('ñ'.repeat(37)) ?? '', /demasiado larga/, '37 letters of 2 bytes are 74');
    });
});
