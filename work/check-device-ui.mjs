import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const source = read('adaptive-ui.mjs');

function environment({ width = 390, height = 844, coarse = false, wideFine = false, invite = '' } = {}) {
  const ids = new Map(), nodes = [], frames = [], observers = [], media = [], commands = [], gameInputs = [];
  const listeners = new Map();
  let document;
  class Node {
    constructor(tag = 'div', cls = '', text = '') {
      this.tagName = tag.toUpperCase(); this.className = cls; this.textContent = text;
      this.children = []; this.parentNode = null; this.dataset = {}; this.attrs = {};
      this.listeners = new Map(); this.value = ''; this.checked = false;
      this.disabled = false; this.hidden = false; this.tabIndex = 0; this.open = false;
      nodes.push(this);
    }
    set id(value) { this._id = value; ids.set(value, this); }
    get id() { return this._id || ''; }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    removeAttribute(key) { delete this.attrs[key]; }
    getAttribute(key) { return this.attrs[key] ?? null; }
    append(...children) { for (const node of children) { node.remove(); node.parentNode = this; this.children.push(node); } }
    insertBefore(node, before) { node.remove(); const index = this.children.indexOf(before); assert(index >= 0, 'valid insertion anchor'); node.parentNode = this; this.children.splice(index, 0, node); }
    remove() { if (this.parentNode) { const index = this.parentNode.children.indexOf(this); if (index >= 0) this.parentNode.children.splice(index, 1); } this.parentNode = null; }
    all() { return this.children.flatMap(node => [node, ...node.all()]); }
    matches(selector) {
      return selector.split(',').some(part => {
        const s = part.trim();
        if (s === 'button:not([data-arcade-control])') return this.tagName === 'BUTTON' && !this.dataset.arcadeControl;
        if (s === '[data-device-ui-control]') return this.dataset.deviceUiControl !== undefined;
        if (s === '[contenteditable="true"]') return this.attrs.contenteditable === 'true';
        if (s === 'label[for="roomCodeInput"]') return this.tagName === 'LABEL' && this.attrs.for === 'roomCodeInput';
        if (s.startsWith('.')) return this.className.split(/\s+/).includes(s.slice(1));
        if (s.startsWith('#')) return this.id === s.slice(1);
        return this.tagName === s.toUpperCase();
      });
    }
    closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node; return null; }
    querySelector(selector) { return this.all().find(node => node.matches(selector)) || null; }
    addEventListener(type, fn, capture = false) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push({ fn, capture: capture === true }); }
    dispatch(type, options = {}) {
      const event = { target: this, key: '', code: '', repeat: false, defaultPrevented: false, stopped: false, ...options,
        preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
      for (const capture of [true, false]) for (const entry of this.listeners.get(type) || []) {
        if (entry.capture !== capture || event.stopped) continue;
        entry.fn(event);
      }
      return event;
    }
    click() { if (!this.disabled) return this.dispatch('click'); }
    focus() { document.activeElement = this; }
  }
  const node = (id, tag = 'div', cls = '') => { const value = new Node(tag, cls); value.id = id; return value; };
  const body = node('body', 'body'), lobby = node('roomLobby', 'section'), form = node('form', 'div', 'room-lobby-form');
  body.append(lobby); lobby.append(form);
  const nickname = node('roomNickname', 'input'), consent = node('roomConsent', 'input'), create = node('roomCreateBtn', 'button');
  const divider = node('divider', 'div', 'room-divider'), codeLabel = node('codeLabel', 'label'), joinRow = node('joinRow', 'div', 'room-join-row');
  const code = node('roomCodeInput', 'input'), join = node('roomJoinBtn', 'button'); code.value = invite; codeLabel.setAttribute('for', 'roomCodeInput');
  form.append(nickname, consent, create, divider, codeLabel, joinRow); joinRow.append(code, join);
  let created = 0, joined = 0, legacyJoins = 0;
  create.addEventListener('click', () => created++); join.addEventListener('click', () => joined++);
  // The real transport registers its legacy Enter handler before this module.
  nickname.addEventListener('keydown', event => { if (event.key === 'Enter') legacyJoins++; });
  const dialog = node('arcadeDialog', 'dialog'), strip = node('strip', 'div', 'five-round-strip'), dpad = node('arcadeDpad');
  const help = node('arcadeHelp', 'p'), roster = node('arcadeRoster'), actionHint = node('arcadeActionHint', 'small'), status = node('arcadeStatus', 'p'); dialog.append(strip, help, roster, dpad, actionHint, status); body.append(dialog);
  document = {
    body, activeElement: body,
    getElementById: id => ids.get(id) || null,
    querySelector: selector => body.querySelector(selector),
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); }
  };
  const windowListeners = new Map();
  const e = {
    console, document, innerWidth: width, innerHeight: height, Math, String, Number, Object, Array, Set, Map,
    window: { addEventListener(type, fn) { if (!windowListeners.has(type)) windowListeners.set(type, []); windowListeners.get(type).push(fn); } },
    matchMedia(query) { const value = { matches: query === '(pointer:coarse)' ? coarse : wideFine, handlers: [], addEventListener(type, fn) { this.handlers.push(fn); } }; media.push(value); return value; },
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} },
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    $: id => ids.get(id), el: (tag, cls = '', text = '') => new Node(tag, cls, text),
    arcadeDialog: dialog, arcadeState: { id: 'game-1', phase: 'round', format: 'points', chosen: 'dodge', totalPoints: { self: 8, other: 5 }, members: [{ id: 'self', name: 'Me', response: 'join' }, { id: 'other', name: 'Other', response: 'join' }], world: { game: 'dodge', players: [{ id: 'self', score: 30 }] } },
    arcadeGames: { dodge: { hint: '피해서 점수를 모아요.', key: 'SPACE / F', controls: 'standard', input: 'dash' }, doors: { hint: '식당 선택', key: 'A / W / D' }, memory: { hint: '불빛 순서를 따라해요.', key: 'A / W / D', controls: 'choices' } },
    arcadeSelf: () => 'self', arcadeEnsureUI: () => 'ensured', arcadeRender: () => 'rendered',
    releaseCount: 0, arcadeClearKeys() { e.releaseCount++; },
    netRoom: { send: command => commands.push(command) },
    arcadeMoveKeys: { ArrowLeft: 'left', KeyA: 'left', ArrowUp: 'up', KeyW: 'up' }, arcadeUIKeys: new Set(), arcadeHeld: () => [], arcadeInput: (...args) => gameInputs.push(args),
    arcadeExtraEnsureControls() {}, arcadeExtraChoices: { children: [{ disabled: false }, { disabled: false }, { disabled: false }] }
  };
  vm.createContext(e);
  vm.runInContext(source + '\nthis.ui={layoutFor:deviceLayoutFor,refresh:deviceRefreshLayout,setRoomMode:deviceSetRoomMode,renderRoom:deviceRenderRoom,ensure:deviceEnsureGameUI,renderGame:deviceRenderGame,get layout(){return deviceLayout;},get roomMode(){return deviceRoomMode;},get infoOpen(){return deviceInfoOpen;}};', e);
  return { e, ids, nodes, media, frames, observers, listeners, windowListeners, commands, gameInputs, Node,
    counts: () => ({ created, joined, legacyJoins }),
    flushObservers() { for (const observer of observers) observer.fn(); },
    resize(width, height, { coarse = media[0].matches, wideFine = media[1].matches } = {}) { e.innerWidth = width; e.innerHeight = height; media[0].matches = coarse; media[1].matches = wideFine; for (const fn of windowListeners.get('resize') || []) fn(); },
    flushFrames() { while (frames.length) frames.shift()(); }
  };
}

{
  const t = environment();
  for (const [width, height, coarse, fine, expected] of [
    [390, 844, false, false, 'phone'], [720, 1024, true, false, 'phone'],
    [721, 1024, false, false, 'compact'], [844, 390, false, false, 'touch-wide'],
    [1024, 768, true, false, 'touch-wide'], [1280, 800, true, false, 'touch-wide'],
    [1099, 600, false, false, 'touch-wide'], [1099, 601, false, false, 'compact'],
    [1366, 900, false, true, 'desktop'], [1100, 650, false, true, 'desktop'],
    [1366, 600, false, false, 'compact']
  ]) assert.equal(t.e.ui.layoutFor(width, height, coarse, fine), expected, `${width}×${height} classification`);
}
for (const invite of ['', 'AB12CD']) {
  const t = environment({ invite }), { e, ids } = t;
  assert.equal(e.ui.roomMode, invite ? 'join' : 'create', 'invitations open the join tab');
  assert.equal(ids.get('deviceJoinTab').getAttribute('aria-selected'), String(!!invite));
  assert.equal(ids.get('deviceCreateTab').tabIndex, invite ? -1 : 0);
  assert.equal(ids.get('deviceJoinPane').getAttribute('role'), 'tabpanel');
  const original = ['roomNickname', 'roomConsent', 'roomCodeInput', 'roomCreateBtn', 'roomJoinBtn'].map(id => ids.get(id));
  ids.get('roomNickname').value = '정훈'; ids.get('roomConsent').checked = true; ids.get('roomCodeInput').value = 'SAVE12';
  e.ui.setRoomMode('create'); e.ui.setRoomMode('join');
  assert.equal(ids.get('roomNickname').value, '정훈'); assert.equal(ids.get('roomConsent').checked, true); assert.equal(ids.get('roomCodeInput').value, 'SAVE12');
  assert.deepEqual(['roomNickname', 'roomConsent', 'roomCodeInput', 'roomCreateBtn', 'roomJoinBtn'].map(id => ids.get(id)), original, 'tabs move original transport controls rather than duplicating them');
  ids.get('deviceJoinTab').dispatch('keydown', { key: 'ArrowLeft' });
  assert.equal(e.ui.roomMode, 'create'); assert.equal(e.document.activeElement, ids.get('deviceCreateTab'));
  ids.get('deviceCreateTab').dispatch('keydown', { key: 'End' }); assert.equal(e.ui.roomMode, 'join'); assert.equal(e.document.activeElement, ids.get('deviceJoinTab'));
  ids.get('deviceJoinTab').dispatch('keydown', { key: 'Home' }); assert.equal(e.ui.roomMode, 'create');
  const createEnter = ids.get('roomNickname').dispatch('keydown', { key: 'Enter' });
  assert.equal(createEnter.defaultPrevented, true); assert.deepEqual(t.counts(), { created: 1, joined: 0, legacyJoins: 0 }, 'create-tab Enter cannot join a preserved old code');
  e.ui.setRoomMode('join'); ids.get('roomNickname').dispatch('keydown', { key: 'Enter' });
  assert.deepEqual(t.counts(), { created: 1, joined: 1, legacyJoins: 0 });
  ids.get('roomJoinBtn').disabled = true; ids.get('roomNickname').dispatch('keydown', { key: 'Enter' }); assert.equal(t.counts().joined, 1, 'disabled native actions stay disabled');
  ids.get('roomNickname').disabled = true; ids.get('roomConsent').disabled = true; t.flushObservers();
  assert.equal(ids.get('deviceCreateTab').disabled, true); assert.equal(ids.get('deviceJoinTab').disabled, true); assert.equal(e.ui.setRoomMode('create'), false, 'connecting cannot switch room modes');
  ids.get('roomNickname').disabled = false; ids.get('roomConsent').disabled = false; t.flushObservers();
  assert.equal(ids.get('deviceCreateTab').disabled, false); assert.equal(e.ui.setRoomMode('wrong'), false);
  assert.equal(t.commands.length, 0, 'room presentation does not send transport commands');
}
{
  const t = environment(), { e, ids } = t, state = JSON.stringify(e.arcadeState);
  assert.equal(e.arcadeEnsureUI(), 'ensured');
  const button = ids.get('deviceInfoToggle');
  assert.equal(button.getAttribute('aria-controls'), 'arcadeHelp arcadeRoster'); assert.equal(button.getAttribute('aria-expanded'), 'false'); assert.equal(button.hidden, false);
  assert.equal(ids.get('deviceOwnSummary').textContent, '내 누적 8점'); assert.match(ids.get('deviceInputHint').textContent, /버튼.*조작/); assert.doesNotMatch(ids.get('deviceInputHint').textContent, /WASD|SPACE/i);
  for (const feedback of ['0.7초 뒤 다시', '회수 중…', '결과를 기다려요']) {
    ids.get('arcadeActionHint').textContent = feedback; e.ui.renderGame(); assert.equal(ids.get('arcadeActionHint').textContent, feedback, 'touch prompts retain live cooldown and result feedback');
  }
  ids.get('arcadeActionHint').textContent = e.arcadeGames.dodge.key; e.ui.renderGame(); assert.match(ids.get('arcadeActionHint').textContent, /버튼/); assert.doesNotMatch(ids.get('arcadeActionHint').textContent, /SPACE|\bF\b/i);
  const originalKey = e.arcadeGames.dodge.key; e.arcadeGames.dodge.key = 'SPACE 두 번'; ids.get('arcadeActionHint').textContent = 'SPACE 두 번'; e.ui.renderGame(); assert.equal(ids.get('arcadeActionHint').textContent, '두 번 눌러 조절'); e.arcadeGames.dodge.key = originalKey;
  for (const [keyboard, touch] of [
    ['12점 · Space로 회수', '12점 · 액션 버튼으로 회수'],
    ['방향키로 이동하고 Space를 누르세요', '이동 버튼으로 이동하고 액션 버튼을 누르세요'],
    ['A / W / D로 선택', '왼쪽·가운데·오른쪽 버튼으로 선택'],
    ['← / →로 조준', '좌우 버튼으로 조준']
  ]) {
    ids.get('arcadeStatus').textContent = keyboard; e.ui.renderGame(); assert.equal(ids.get('arcadeStatus').textContent, touch, 'touch status retains scores/events and uses natural button particles');
  }
  button.click(); assert.equal(button.getAttribute('aria-expanded'), 'true'); assert.equal(button.textContent, '정보 접기');
  button.click(); assert.equal(button.getAttribute('aria-expanded'), 'false');
  e.arcadeState.phase = 'done'; e.ui.renderGame(); assert.equal(button.hidden, true); assert.equal(button.getAttribute('aria-expanded'), 'true', 'completed rounds always expose the final ranking');
  e.arcadeState.phase = 'invite'; e.ui.renderGame(); assert.equal(button.hidden, true, 'invitation decisions are never hidden behind game-info controls');
  e.arcadeState.phase = 'round'; e.ui.renderGame();
  const nodeCount = t.nodes.length; for (let i = 0; i < 100; i++) { e.arcadeEnsureUI(); assert.equal(e.arcadeRender(), 'rendered'); }
  assert.equal(t.nodes.length, nodeCount, 'render refresh reuses a single set of device controls');
  assert.equal(JSON.stringify(e.arcadeState), state, 'pure display controls never alter session, score, membership or input state'); assert.equal(t.commands.length, 0); assert.equal(t.gameInputs.length, 0);
  const released = e.releaseCount;
  t.resize(400, 820); t.resize(410, 810); assert.equal(t.frames.length, 1, 'resize rendering is coalesced'); t.flushFrames(); assert.equal(e.releaseCount, released, 'same-layout resizes do not manufacture an input release');
  t.resize(844, 390); t.flushFrames(); assert.equal(e.ui.layout, 'touch-wide'); assert.equal(e.releaseCount, released + 1); assert.equal(e.document.body.dataset.inputMode, 'touch');
  t.resize(1366, 900, { wideFine: true }); t.flushFrames(); assert.equal(e.ui.layout, 'desktop'); assert.equal(e.releaseCount, released + 2); assert.equal(e.document.body.dataset.inputMode, 'keyboard'); assert.equal(button.hidden, true); assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(ids.get('deviceInputHint').textContent, '이동 WASD / 방향키 · SPACE / F'); assert.equal(ids.get('deviceJoinPane').getAttribute('role'), null, 'desktop panes retain ordinary document semantics');
  ids.get('roomNickname').dispatch('keydown', { key: 'Enter' }); assert.equal(t.counts().legacyJoins, 1, 'desktop retains the original transport Enter behavior');
  t.media[0].matches = true; t.media[1].matches = false;
  for (const query of t.media) for (const fn of query.handlers) fn();
  assert.equal(t.frames.length, 1, 'input-device changes coalesce without a viewport resize'); t.flushFrames();
  assert.equal(e.ui.layout, 'touch-wide'); assert.equal(e.releaseCount, released + 3); assert.equal(e.document.body.dataset.inputMode, 'touch');
  e.arcadeState = null; e.ui.renderGame(); assert.equal(button.hidden, true); assert.equal(e.arcadeDialog.dataset.sessionPhase, 'menu');
}

// Execute the actual three production capture listeners. Avoid a string-only
// assertion that could pass even if another key path still swallowed Space.
function keyListeners(text) {
  const startToken = "document.addEventListener('keydown',", calls = [];
  let cursor = 0;
  while ((cursor = text.indexOf(startToken, cursor)) >= 0) {
    const start = cursor, open = text.indexOf('(', start); let depth = 0, quote = '', escaped = false, end = -1;
    for (let i = open; i < text.length; i++) {
      const c = text[i];
      if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = ''; continue; }
      if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
      if (c === '(') depth++; else if (c === ')' && --depth === 0) { end = i + 1; break; }
    }
    assert(end > start, 'complete capture listener'); calls.push(text.slice(start, end) + ';'); cursor = end;
  }
  return calls;
}
{
  const t = environment(), { e, ids } = t;
  e.arcadeEnsureUI(); e.arcadeDialog.open = true;
  const actual = [...keyListeners(read('arcade-ui.mjs')), ...keyListeners(read('source/scripts/arcade-renderers.js'))];
  assert.equal(actual.length, 3, 'standard, rhythm/doors and choice input paths are covered');
  vm.runInContext(actual.join('\n'), e);
  const dispatch = (target, code) => {
    const event = { target, code, key: code === 'Space' ? ' ' : '', repeat: false, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    for (const fn of t.listeners.get('keydown') || []) { if (event.stopped) break; fn(event); }
    return event;
  };
  for (const [game, code, action] of [['dodge', 'Space', 'dash'], ['doors', 'KeyA', 'jump'], ['memory', 'KeyA', 'hit']]) {
    e.arcadeState.world.game = game;
    for (const target of [ids.get('deviceInfoToggle'), new t.Node('button'), ids.get('roomNickname')]) {
      const count = t.gameInputs.length, event = dispatch(target, code); assert.equal(t.gameInputs.length, count, `${game} UI focus does not trigger gameplay`); assert.equal(event.prevented, false, 'the native button/input key action remains available');
    }
    const event = dispatch(e.document.body, code); assert.equal(event.prevented, true); assert.deepEqual(t.gameInputs.at(-1), [action, true], `${game} body-focused keyboard input still plays the game`);
  }
  e.arcadeState.world.game = 'dodge';
  const padButton = new t.Node('button'); padButton.dataset.arcadeControl = 'action'; const event = dispatch(padButton, 'Space'); assert.equal(event.prevented, true); assert.deepEqual(t.gameInputs.at(-1), ['dash', true], 'the real game pad retains its keyboard action');
  const info = ids.get('deviceInfoToggle'), before = t.gameInputs.length, eventInfo = dispatch(info, 'Space'); if (!eventInfo.prevented) info.click();
  assert.equal(info.getAttribute('aria-expanded'), 'true'); assert.equal(t.gameInputs.length, before, 'Space can toggle game information without firing an attack');
}

{
  const t=environment(),{e,ids}=t;e.arcadeEnsureUI();e.arcadeState.format='single';
  const w=e.arcadeState.world,p=w.players[0];w.game='parking';p.parked=4;p.score=4179;e.ui.renderGame();assert.equal(ids.get('deviceOwnSummary').textContent,'내 주차 4대');
  w.game='dodge';w.meta={roundSurvival:true};p.health=2;p.score=1_000_000+12000;e.ui.renderGame();assert.equal(ids.get('deviceOwnSummary').textContent,'생존 · ♥♥');
  p.eliminated=true;e.ui.renderGame();assert.equal(ids.get('deviceOwnSummary').textContent,'이번 판 관전');
  e.arcadeState.format='points';e.ui.renderGame();assert.equal(ids.get('deviceOwnSummary').textContent,'내 누적 8점');
}

console.log('PASS: device and breakpoint classification; invited/mobile room tabs, preserved native fields and consent, busy protection, mode-correct Enter and keyboard tab focus; accessible info/final ranking state, parking count and survival summaries without internal rank scores, stable controls, untouched game/transport state, coalesced layout/input release, and all three actual game key-capture paths preserve UI button keyboard activation.');
