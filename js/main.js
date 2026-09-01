import { Game } from './game.js';
import { UI } from './ui.js';

const ui = new UI();
const game = new Game({
  container: document.getElementById('game'),
  sceneCanvas: document.getElementById('scene'),
  trailCanvas: document.getElementById('trail'),
  callbacks: ui.callbacks(),
});
ui.bind(game);
window.game = game; // handy for tuning/debugging from the console

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // offline support is a nice-to-have; the game runs fine without it
    });
  });
}
