// ============================================================================
// DOM layer: HUD, menu, countdown, results, toasts. The game engine calls
// back into this via the callbacks object; buttons call into the game.
// ============================================================================

import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'),
      balance: $('hud-balance'),
      timer: $('hud-timer'),
      timerFill: $('timer-fill'),
      total: $('hud-total'),
      stakeLabel: $('stake-label'),
      stakeChips: $('stake-chips'),
      vignette: $('vignette'),
      toast: $('toast'),
      menu: $('menu'),
      menuBalance: $('menu-balance'),
      btnPlay: $('btn-play'),
      btnFunds: $('btn-funds'),
      countdown: $('countdown'),
      countNum: $('count-num'),
      results: $('results'),
      resStaked: $('res-staked'),
      resTotal: $('res-total'),
      resPayout: $('res-payout'),
      resBalance: $('res-balance'),
      btnAgain: $('btn-again'),
      btnMenu: $('btn-menu'),
    };
    this.toastTimer = null;
  }

  formatMoney(v) {
    const sign = v < 0 ? '−' : '';
    return `${sign}${CONFIG.currency}${Math.abs(v).toFixed(2)}`;
  }

  callbacks() {
    return {
      formatMoney: (v) => this.formatMoney(v),
      onHud: (s) => this.renderHud(s),
      onRoundEnd: (summary) => this.showResults(summary),
      onBomb: () => this.flashVignette(),
      onInsufficient: () => this.showToast('Not enough balance for that bet'),
    };
  }

  bind(game) {
    this.game = game;

    // stake chips
    CONFIG.stakeMultipliers.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'chip' + (i === 0 ? ' active' : '');
      b.textContent = `×${m}`;
      b.addEventListener('click', () => {
        game.setStakeIndex(i);
        [...this.el.stakeChips.children].forEach((c, j) => c.classList.toggle('active', j === i));
      });
      this.el.stakeChips.appendChild(b);
    });

    this.el.btnPlay.addEventListener('click', () => this.startRoundFlow());
    this.el.btnAgain.addEventListener('click', () => {
      this.hide(this.el.results);
      this.startRoundFlow();
    });
    this.el.btnMenu.addEventListener('click', () => {
      this.hide(this.el.results);
      this.showMenu();
    });
    this.el.btnFunds.addEventListener('click', () => {
      game.addFunds(1000);
      this.showMenu();
    });

    this.showMenu();
  }

  show(el) { el.classList.remove('hidden'); }
  hide(el) { el.classList.add('hidden'); }

  showMenu() {
    this.show(this.el.menu);
    this.hide(this.el.hud);
    this.el.menuBalance.textContent = this.formatMoney(this.game.balance);
    const broke = this.game.balance < CONFIG.baseStake * 2;
    this.el.btnFunds.classList.toggle('hidden', !broke);
    this.el.btnPlay.disabled = broke;
  }

  startRoundFlow() {
    if (this.game.balance < CONFIG.baseStake) return;
    this.hide(this.el.menu);
    this.show(this.el.hud);
    this.game.beginCountdown();
    this.runCountdown(() => this.game.startRound());
  }

  runCountdown(done) {
    const seq = ['3', '2', '1', 'SLICE!'];
    let i = 0;
    this.show(this.el.countdown);
    const step = () => {
      if (i >= seq.length) {
        this.hide(this.el.countdown);
        done();
        return;
      }
      this.el.countNum.textContent = seq[i];
      this.el.countNum.classList.remove('pop');
      void this.el.countNum.offsetWidth; // restart the pop animation
      this.el.countNum.classList.add('pop');
      i++;
      setTimeout(step, i === seq.length ? 550 : 750);
    };
    step();
  }

  renderHud(s) {
    this.el.balance.textContent = this.formatMoney(s.balance);
    this.el.timer.textContent = Math.ceil(s.timeLeft);
    this.el.timerFill.style.width = `${(s.timeLeft / CONFIG.roundSeconds) * 100}%`;
    this.el.total.textContent = this.formatMoney(s.total);
    this.el.total.classList.toggle('neg', s.total < 0);
    this.el.stakeLabel.textContent =
      `Stake ${this.formatMoney(s.baseStake * s.stakeMultiplier)} · per fruit size`;
  }

  showResults({ total, payout, staked, balance }) {
    this.el.resStaked.textContent = this.formatMoney(staked);
    this.el.resTotal.textContent = this.formatMoney(total);
    this.el.resTotal.classList.toggle('neg', total < 0);
    this.el.resPayout.textContent = this.formatMoney(payout);
    this.el.resBalance.textContent = this.formatMoney(balance);
    this.hide(this.el.hud);
    this.show(this.el.results);
  }

  flashVignette() {
    this.el.vignette.classList.remove('flash');
    void this.el.vignette.offsetWidth;
    this.el.vignette.classList.add('flash');
  }

  showToast(msg) {
    this.el.toast.textContent = msg;
    this.show(this.el.toast);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.hide(this.el.toast), 1600);
  }
}
