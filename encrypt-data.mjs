#!/usr/bin/env node
// Cifra el export de Ops para la app de staff (Gracia Latidos 2026).
//
// Uso:
//   node encrypt-data.mjs            -> genera data.enc.json (aquí y en el clon git)
//   node encrypt-data.mjs --publish  -> además hace commit + push del clon git
//
// Formato: AES-GCM 256, clave derivada del PIN con PBKDF2-SHA256.
// El PIN se lee de STAFF_PIN (env) o de .staff-pin junto a este script.
// El PIN NUNCA se escribe en el repo.

import { webcrypto as crypto } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.LATIDOS_SRC || "/workspace/latidos-ops/exports/inscritos-race-day.json";
const PIN_FILE = process.env.STAFF_PIN_FILE || join(HERE, ".staff-pin");
const OUT_NAME = "data.enc.json";
const OUT = join(HERE, OUT_NAME);
const GIT_CLONE = process.env.LATIDOS_GIT || "/workspace/latidos-race-day-staff-git";
const ITERATIONS = 600000;
const args = new Set(process.argv.slice(2));

const b64 = (buf) => Buffer.from(buf).toString("base64");
const unb64 = (s) => new Uint8Array(Buffer.from(s, "base64"));

function readPin() {
  const pin = (process.env.STAFF_PIN || (existsSync(PIN_FILE) ? readFileSync(PIN_FILE, "utf8") : "")).trim();
  if (!/^\d{6}$/.test(pin)) {
    throw new Error("PIN no encontrado o inválido (se esperan 6 dígitos en STAFF_PIN o " + PIN_FILE + ")");
  }
  return pin;
}

async function deriveKey(pin, salt, iterations) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function tryDecryptExisting(pin) {
  if (!existsSync(OUT)) return null;
  try {
    const env = JSON.parse(readFileSync(OUT, "utf8"));
    if (env.iter !== ITERATIONS) return null;
    const salt = unb64(env.salt);
    const key = await deriveKey(pin, salt, env.iter);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, key, unb64(env.ct));
    return { salt, key, plaintext: new TextDecoder().decode(pt) };
  } catch {
    return null; // otro PIN o archivo corrupto -> sal nueva
  }
}

async function main() {
  const pin = readPin();
  const raw = readFileSync(SRC, "utf8");
  const data = JSON.parse(raw); // valida JSON
  if (!Array.isArray(data.inscritos)) throw new Error("El export no tiene 'inscritos'");
  const plaintext = JSON.stringify(data);

  const prev = await tryDecryptExisting(pin);
  let changed = true;
  if (prev && prev.plaintext === plaintext && !args.has("--force")) {
    changed = false;
    console.log("Sin cambios en los datos; " + OUT_NAME + " se mantiene.");
  } else {
    // Reusar la sal si el PIN es el mismo: así los teléfonos ya desbloqueados siguen funcionando.
    const salt = prev && !args.has("--new-salt") ? prev.salt : crypto.getRandomValues(new Uint8Array(16));
    const key = prev && !args.has("--new-salt") ? prev.key : await deriveKey(pin, salt, ITERATIONS);
    const iv = crypto.getRandomValues(new Uint8Array(12)); // IV nuevo SIEMPRE
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
    const env = { v: 1, alg: "AES-GCM-256", kdf: "PBKDF2-SHA256", iter: ITERATIONS, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
    writeFileSync(OUT, JSON.stringify(env) + "\n");

    // Comprobación de ida y vuelta
    const check = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await deriveKey(pin, salt, ITERATIONS), ct);
    if (new TextDecoder().decode(check) !== plaintext) throw new Error("Falló la verificación de descifrado");
    console.log("OK: " + OUT + " (" + data.inscritos.length + " inscritos)");
  }

  if (existsSync(join(GIT_CLONE, ".git"))) {
    copyFileSync(OUT, join(GIT_CLONE, OUT_NAME));
    console.log("Copiado a " + join(GIT_CLONE, OUT_NAME));
    if (args.has("--publish")) {
      const git = (...a) => execFileSync("git", ["-C", GIT_CLONE, ...a], { stdio: "inherit" });
      git("add", OUT_NAME);
      const dirty = execFileSync("git", ["-C", GIT_CLONE, "diff", "--cached", "--name-only"]).toString().trim();
      if (!dirty) {
        console.log("Nada que publicar.");
      } else {
        git("commit", "-m", "Actualizar datos cifrados (" + data.inscritos.length + " inscritos)");
        git("push", "origin", "main");
        console.log("Publicado. GitHub Pages tarda ~1 min en actualizar.");
      }
    }
  } else if (args.has("--publish")) {
    throw new Error("No se encontró el clon git en " + GIT_CLONE);
  }
  void changed;
}

main().catch((err) => {
  console.error("Error: " + (err && err.message ? err.message : err));
  process.exit(1);
});
