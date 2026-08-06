// ============================================================================
// DOM layer: HUD, menu (with bet picker), countdown, results, toasts. The
// game engine calls back into this via the callbacks object; buttons call
// into the game.
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
      hudBet: $('hud-bet'),
      vignette: $('vignette'),
      frenzyGlow: $('frenzy-glow'),
      frenzyBanner: $('frenzy-banner'),
      toast: $('toast'),
      menu: $('menu'),
      menuBalance: $('menu-balance'),
      betChips: $('bet-chips'),
      btnPlay: $('btn-play'),
      btnFunds: $('btn-funds'),
      countdown: $('countdown'),
      countNum: $('count-num'),
      results: $('results'),
      resBet: $('res-bet'),
      resTotal: $('res-total'),
      resPayout: $('res-payout'),
      resNet: $('res-net'),
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
      onFrenzy: (on) => this.setFrenzy(on),
    };
  }

  setFrenzy(on) {
    this.el.frenzyGlow.classList.toggle('hidden', !on);
    if (on) {
      this.show(this.el.frenzyBanner);
      this.el.frenzyBanner.classList.remove('pop');
      void this.el.frenzyBanner.offsetWidth;
      this.el.frenzyBanner.classList.add('pop');
      clearTimeout(this.frenzyBannerTimer);
      this.frenzyBannerTimer = setTimeout(() => this.hide(this.el.frenzyBanner), 2200);
    } else {
      this.hide(this.el.frenzyBanner);
    }
  }

  bind(game) {
    this.game = game;

    // bet picker chips
    CONFIG.betOptions.forEach((amount) => {
      const b = document.createElement('button');
      b.className = 'chip' + (amount === game.selectedBet ? ' active' : '');
      b.textContent = `${CONFIG.currency}${amount}`;
      b.addEventListener('click', () => {
        game.setBet(amount);
        [...this.el.betChips.children].forEach((c, j) =>
          c.classList.toggle('active', CONFIG.betOptions[j] === amount));
        this.refreshMenu();
      });
      this.el.betChips.appendChild(b);
    });

    this.el.btnPlay.addEventListener('click', () => this.startRoundFlow());
    this.el.btnAgain.addEventListener('click', () => {
      this.hide(this.el.results);
      if (this.game.balance < this.game.selectedBet) this.showMenu();
      else this.startRoundFlow();
    });
    this.el.btnMenu.addEventListener('click', () => {
      this.hide(this.el.results);
      this.showMenu();
    });
    this.el.btnFunds.addEventListener('click', () => {
      game.addFunds(1000);
      this.refreshMenu();
    });

    this.showMenu();
  }

  show(el) { el.classList.remove('hidden'); }
  hide(el) { el.classList.add('hidden'); }

  showMenu() {
    this.show(this.el.menu);
    this.hide(this.el.hud);
    this.refreshMenu();
  }

  refreshMenu() {
    this.el.menuBalance.textContent = this.formatMoney(this.game.balance);
    const bet = this.game.selectedBet;
    const broke = this.game.balance < Math.min(...CONFIG.betOptions);
    const cantAfford = this.game.balance < bet;
    this.el.btnFunds.classList.toggle('hidden', !broke);
    this.el.btnPlay.disabled = cantAfford;
    this.el.btnPlay.textContent = cantAfford
      ? 'Balance too low for this bet'
      : `Bet ${this.formatMoney(bet)} · Play ${CONFIG.roundSeconds}s`;
  }

  startRoundFlow() {
    if (this.game.balance < this.game.selectedBet) {
      this.refreshMenu();
      return;
    }
    this.hide(this.el.menu);
    this.show(this.el.hud);
    this.game.beginCountdown();
    this.runCountdown(() => {
      if (!this.game.startRound()) this.showMenu();
    });
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
    this.el.hudBet.textContent = `Bet ${this.formatMoney(s.bet)}`;
  }

  showResults({ bet, total, payout, net, balance }) {
    this.el.resBet.textContent = this.formatMoney(bet);
    this.el.resTotal.textContent = this.formatMoney(total);
    this.el.resTotal.classList.toggle('neg', total < 0);
    this.el.resPayout.textContent = this.formatMoney(payout);
    this.el.resNet.textContent = (net > 0 ? '+' : '') + this.formatMoney(net);
    this.el.resNet.classList.toggle('neg', net < 0);
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
