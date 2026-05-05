(() => {
  const CryptoUtils = {
    textEncoder: new TextEncoder(),
    textDecoder: new TextDecoder(),

    toBase64(bytes) {
      const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
      return btoa(binary);
    },

    fromBase64(base64) {
      const binary = atob(base64);
      return Uint8Array.from(binary, (c) => c.charCodeAt(0));
    },

    async deriveKey(masterPassword, saltBytes) {
      const baseKey = await crypto.subtle.importKey(
        "raw",
        this.textEncoder.encode(masterPassword),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
      );

      return crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: saltBytes,
          iterations: 250000,
          hash: "SHA-256"
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    },

    async encryptVault(vaultObject, masterPassword) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await this.deriveKey(masterPassword, salt);
      const plaintext = this.textEncoder.encode(JSON.stringify(vaultObject));

      const cipherBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        plaintext
      );

      return {
        version: 1,
        algorithm: "AES-GCM",
        kdf: "PBKDF2-SHA256",
        iterations: 250000,
        salt: this.toBase64(salt),
        iv: this.toBase64(iv),
        ciphertext: this.toBase64(new Uint8Array(cipherBuffer))
      };
    },

    async decryptVault(encryptedVault, masterPassword) {
      const salt = this.fromBase64(encryptedVault.salt);
      const iv = this.fromBase64(encryptedVault.iv);
      const ciphertext = this.fromBase64(encryptedVault.ciphertext);
      const key = await this.deriveKey(masterPassword, salt);

      const plainBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
      );

      const parsed = JSON.parse(this.textDecoder.decode(plainBuffer));
      if (!Array.isArray(parsed.accounts)) {
        throw new Error("Vault data is invalid.");
      }
      return parsed;
    },

    base32ToBytes(base32) {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      const clean = (base32 || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
      let bits = "";
      for (const c of clean) {
        const idx = alphabet.indexOf(c);
        if (idx === -1) continue;
        bits += idx.toString(2).padStart(5, "0");
      }

      const bytes = [];
      for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
      }
      return new Uint8Array(bytes);
    },

    async hmacSha1(keyBytes, messageBytes) {
      const key = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: "SHA-1" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, messageBytes);
      return new Uint8Array(sig);
    },

    async generateTotp(secret, period = 30, digits = 6) {
      const keyBytes = this.base32ToBytes(secret);
      const counter = Math.floor(Date.now() / 1000 / period);
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setUint32(0, Math.floor(counter / 2 ** 32));
      view.setUint32(4, counter >>> 0);

      const hmac = await this.hmacSha1(keyBytes, new Uint8Array(buffer));
      const offset = hmac[hmac.length - 1] & 0x0f;
      const code =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

      return String(code % 10 ** digits).padStart(digits, "0");
    }
  };

  globalThis.CryptoUtils = CryptoUtils;
})();
