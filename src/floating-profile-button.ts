const BUTTON_ID = 'chameleon-floating-profile-button';
const STORAGE_KEY = 'floatingProfileButtonPosition';

interface ButtonSettings {
  enabled: boolean;
  reloadTab: boolean;
}

interface ButtonPosition {
  left: number;
  top: number;
}

let button: HTMLDivElement = null;
let dragging = false;
let moved = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

let clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

let savePosition = (left: number, top: number): void => {
  browser.storage.local.set({
    [STORAGE_KEY]: {
      left,
      top,
    },
  });
};

let positionButton = (position?: ButtonPosition): void => {
  if (!button) return;

  let left = position && typeof position.left === 'number' ? position.left : window.innerWidth - 72;
  let top = position && typeof position.top === 'number' ? position.top : 96;

  left = clamp(left, 8, window.innerWidth - button.offsetWidth - 8);
  top = clamp(top, 8, window.innerHeight - button.offsetHeight - 8);

  button.style.left = `${left}px`;
  button.style.top = `${top}px`;
};

let createButton = (): void => {
  if (button || !document.documentElement) return;

  button = document.createElement('div');
  button.id = BUTTON_ID;
  button.title = browser.i18n.getMessage('floating-profile-button-title') || 'Change Chameleon profile';
  button.innerHTML =
    '<span class="chameleon-floating-profile-button-grip"></span><span class="chameleon-floating-profile-button-icon chameleon-floating-profile-button-change">&#8635;</span><span class="chameleon-floating-profile-button-icon chameleon-floating-profile-button-save">+</span>';

  let style = document.createElement('style');
  style.textContent = `
    #${BUTTON_ID} {
      all: initial;
      align-items: stretch;
      background: #0f766e;
      border: 1px solid rgba(255, 255, 255, 0.35);
      border-radius: 6px;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.24);
      color: #fff;
      cursor: pointer;
      display: flex;
      font-family: Arial, sans-serif;
      font-size: 14px;
      height: 34px;
      left: 0;
      line-height: 34px;
      overflow: hidden;
      position: fixed;
      top: 0;
      width: 86px;
      z-index: 2147483647;
    }
    #${BUTTON_ID} .chameleon-floating-profile-button-grip {
      background: repeating-linear-gradient(90deg, rgba(255,255,255,.45) 0 1px, transparent 1px 4px);
      cursor: move;
      display: block;
      width: 16px;
    }
    #${BUTTON_ID} .chameleon-floating-profile-button-icon {
      all: initial;
      color: #fff;
      cursor: pointer;
      display: block;
      flex: 1;
      font-family: Arial, sans-serif;
      font-size: 22px;
      line-height: 32px;
      text-align: center;
    }
    #${BUTTON_ID} .chameleon-floating-profile-button-save {
      border-left: 1px solid rgba(255, 255, 255, 0.28);
      font-size: 20px;
    }
  `;

  document.documentElement.appendChild(style);
  document.documentElement.appendChild(button);

  browser.storage.local.get(STORAGE_KEY).then(item => {
    positionButton(item[STORAGE_KEY]);
  });

  button.addEventListener('mousedown', evt => {
    dragging = true;
    moved = false;
    dragOffsetX = evt.clientX - button.offsetLeft;
    dragOffsetY = evt.clientY - button.offsetTop;
    evt.preventDefault();
  });

  button.addEventListener('click', evt => {
    evt.preventDefault();
    evt.stopPropagation();

    if (moved) return;

    let target = evt.target as HTMLElement;
    browser.runtime.sendMessage({
      action: target.classList.contains('chameleon-floating-profile-button-save') ? 'floatingProfileSave' : 'floatingProfileChange',
    });
  });
};

let removeButton = (): void => {
  if (!button) return;

  button.remove();
  button = null;
};

let applySettings = (settings: ButtonSettings): void => {
  if (settings.enabled) {
    createButton();
  } else {
    removeButton();
  }
};

document.addEventListener('mousemove', evt => {
  if (!dragging || !button) return;

  moved = true;
  positionButton({
    left: evt.clientX - dragOffsetX,
    top: evt.clientY - dragOffsetY,
  });
});

document.addEventListener('mouseup', () => {
  if (!dragging || !button) return;

  dragging = false;
  savePosition(button.offsetLeft, button.offsetTop);
});

window.addEventListener('resize', () => {
  if (!button) return;

  positionButton({
    left: button.offsetLeft,
    top: button.offsetTop,
  });
});

browser.runtime.onMessage.addListener(request => {
  if (request.action === 'floatingProfileButtonSettings') {
    applySettings(request.data);
  }
});

browser.runtime
  .sendMessage({
    action: 'getFloatingProfileButtonSettings',
  })
  .then(applySettings)
  .catch(() => {});
