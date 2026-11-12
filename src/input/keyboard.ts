import { keyboardDirection } from '../movement/ground';
import type { Point } from '../domain/types';
export class Keyboard {
  private pressed = new Set<string>();
  enabled = false;
  viewEnabled = false;
  constructor(private onInteract: () => void, private onPause: () => void, private onBlur: () => void, private onView: () => void = () => {}, private onRecenter: () => void = () => {}) {
    window.addEventListener('keydown',this.down); window.addEventListener('keyup',this.up);
    window.addEventListener('blur',this.blur); document.addEventListener('visibilitychange',this.visibility);
  }
  private down = (e: KeyboardEvent): void => {
    if(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.ctrlKey || e.metaKey || e.altKey)return;
    if(e.code==='Escape'){this.clear();this.onPause();return;}
    if((e.code==='KeyV'||e.code==='KeyR')&&this.viewEnabled){
      e.preventDefault();this.clear();
      if(!e.repeat){if(e.code==='KeyV')this.onView();else this.onRecenter();}
      return;
    }
    if(!this.enabled)return;
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyE','KeyV','KeyR'].includes(e.code))e.preventDefault();
    this.pressed.add(e.code);
    if(e.code==='KeyE'&&!e.repeat)this.onInteract();
  };
  private up = (e: KeyboardEvent): void => { this.pressed.delete(e.code); };
  private blur = (): void => {this.clear();this.onBlur();};
  private visibility = (): void => {if(document.hidden)this.blur();};
  direction(yaw = Math.PI / 4): Point {
    if(!this.enabled)return [0,0];
    const left=this.pressed.has('KeyA')||this.pressed.has('ArrowLeft'),right=this.pressed.has('KeyD')||this.pressed.has('ArrowRight');
    const up=this.pressed.has('KeyW')||this.pressed.has('ArrowUp'),down=this.pressed.has('KeyS')||this.pressed.has('ArrowDown');
    return keyboardDirection(Number(right)-Number(left),Number(down)-Number(up),yaw);
  }
  clear(): void {this.pressed.clear();}
  dispose(): void {
    window.removeEventListener('keydown',this.down);window.removeEventListener('keyup',this.up);
    window.removeEventListener('blur',this.blur);document.removeEventListener('visibilitychange',this.visibility);
  }
}
