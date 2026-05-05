function getCurrentDomain() {
  return window.location.hostname.toLowerCase();
}

function isLoginLikeInput(input) {
  const t = (input.type || "").toLowerCase();
  const n = (input.name || "").toLowerCase();
  const id = (input.id || "").toLowerCase();
  const ac = (input.autocomplete || "").toLowerCase();

  const usernameHints = ["user", "email", "login", "identifier"];
  const passwordHints = ["pass", "password"];
  const otpHints = ["otp", "totp", "2fa", "code", "one-time"];

  return (
    t === "password" ||
    usernameHints.some((h) => n.includes(h) || id.includes(h) || ac.includes(h)) ||
    passwordHints.some((h) => n.includes(h) || id.includes(h) || ac.includes(h)) ||
    otpHints.some((h) => n.includes(h) || id.includes(h) || ac.includes(h))
  );
}

function createOverlayForInput(input) {
  if (input.dataset.openpassBound === "1") return;
  input.dataset.openpassBound = "1";

  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.zIndex = "2147483647";

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      .openpass-btn{width:22px;height:22px;border-radius:50%;border:none;background:#1e293b;color:#93c5fd;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35)}
      .menu{display:none;position:absolute;top:28px;right:0;min-width:260px;max-height:260px;overflow:auto;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:10px;padding:8px;box-shadow:0 10px 25px rgba(0,0,0,.45);font-family:system-ui}
      .item{padding:8px;border-radius:8px;cursor:pointer}
      .item:hover{background:#1e293b}
      .name{font-weight:600}
      .meta{font-size:12px;color:#94a3b8}
    </style>
    <button class="openpass-btn" title="OpenPass">◎</button>
    <div class="menu"></div>
  `;

  const button = shadow.querySelector(".openpass-btn");
  const menu = shadow.querySelector(".menu");

  function reposition() {
    const rect = input.getBoundingClientRect();
    host.style.left = `${window.scrollX + rect.right - 26}px`;
    host.style.top = `${window.scrollY + rect.top + 3}px`;
  }

  async function openMenu() {
    const response = await browser.runtime.sendMessage({
      type: "GET_MATCHING_ACCOUNTS",
      domain: getCurrentDomain()
    });

    menu.innerHTML = "";
    if (!response?.ok) {
      menu.innerHTML = `<div class="item">Vault is locked. Open popup to unlock.</div>`;
    } else {
      const results = response.matches;
      if (!results.length) {
        menu.innerHTML = `<div class="item">No matching accounts for ${getCurrentDomain()}</div>`;
      }

      for (const account of results) {
        const item = document.createElement("div");
        item.className = "item";
        item.innerHTML = `<div class="name">${account.name}</div><div class="meta">${account.username}</div>`;
        item.addEventListener("click", async () => {
          fillCredentials(account);
          menu.style.display = "none";
        });
        menu.appendChild(item);
      }
    }

    menu.style.display = menu.style.display === "block" ? "none" : "block";
  }

  function fillCredentials(account) {
    const userInput = document.querySelector('input[type="email"],input[name*="user" i],input[name*="email" i],input[id*="user" i],input[id*="email" i]');
    const passInput = document.querySelector('input[type="password"]');
    const otpInput = document.querySelector('input[name*="otp" i],input[name*="totp" i],input[name*="2fa" i],input[id*="otp" i],input[id*="totp" i]');

    if (userInput) userInput.value = account.username || "";
    if (passInput) passInput.value = account.password || "";

    if (otpInput && account.totp_secret) {
      browser.runtime.sendMessage({ type: "GENERATE_TOTP", secret: account.totp_secret }).then((res) => {
        if (res?.ok) otpInput.value = res.code;
      });
    }

    [userInput, passInput, otpInput].forEach((el) => {
      if (!el) return;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu();
  });

  document.body.appendChild(host);
  reposition();
  window.addEventListener("scroll", reposition, { passive: true });
  window.addEventListener("resize", reposition);
}

function scanAndAttach() {
  document.querySelectorAll("input").forEach((input) => {
    if (isLoginLikeInput(input)) createOverlayForInput(input);
  });
}

const observer = new MutationObserver(() => scanAndAttach());
observer.observe(document.documentElement, { childList: true, subtree: true });
scanAndAttach();
