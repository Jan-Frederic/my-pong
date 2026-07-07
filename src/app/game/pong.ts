import {
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  AfterViewInit,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

type GameState = 'idle' | 'running' | 'paused' | 'gameover';
type Difficulty = 'easy' | 'medium' | 'hard';

const COURT_W = 800;
const COURT_H = 500;
const PADDLE_W = 12;
const PADDLE_H = 90;
const BALL_R = 8;
const WIN_SCORE = 7;

const AI_SPEED: Record<Difficulty, number> = { easy: 260, medium: 380, hard: 520 };

@Component({
  selector: 'app-pong',
  imports: [MatButtonModule, MatButtonToggleModule, MatCardModule, MatIconModule],
  templateUrl: './pong.html',
  styleUrl: './pong.scss',
})
export class Pong implements AfterViewInit, OnDestroy {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('court');

  protected readonly state = signal<GameState>('idle');
  protected readonly playerScore = signal(0);
  protected readonly aiScore = signal(0);
  protected readonly difficulty = signal<Difficulty>('medium');
  protected readonly winner = signal<'player' | 'ai' | null>(null);
  protected readonly winScore = WIN_SCORE;

  private ctx!: CanvasRenderingContext2D;
  private rafId = 0;
  private lastTime = 0;

  private playerY = COURT_H / 2 - PADDLE_H / 2;
  private aiY = COURT_H / 2 - PADDLE_H / 2;
  private ballX = COURT_W / 2;
  private ballY = COURT_H / 2;
  private ballVX = 0;
  private ballVY = 0;
  private keys = { up: false, down: false };

  private readonly onKeyDown = (e: KeyboardEvent) => this.handleKey(e, true);
  private readonly onKeyUp = (e: KeyboardEvent) => this.handleKey(e, false);

  constructor(private zone: NgZone) {}

  ngAfterViewInit(): void {
    const canvas = this.canvasRef().nativeElement;
    canvas.width = COURT_W;
    canvas.height = COURT_H;
    this.ctx = canvas.getContext('2d')!;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.draw();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  protected start(): void {
    this.playerScore.set(0);
    this.aiScore.set(0);
    this.winner.set(null);
    this.resetPositions();
    this.serveBall(Math.random() < 0.5 ? 1 : -1);
    this.state.set('running');
    this.runLoop();
  }

  protected togglePause(): void {
    if (this.state() === 'running') {
      this.state.set('paused');
      cancelAnimationFrame(this.rafId);
      this.draw();
    } else if (this.state() === 'paused') {
      this.state.set('running');
      this.runLoop();
    }
  }

  protected setDifficulty(value: Difficulty): void {
    this.difficulty.set(value);
  }

  protected onMouseMove(event: MouseEvent): void {
    if (this.state() !== 'running') return;
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    const scale = COURT_H / rect.height;
    const y = (event.clientY - rect.top) * scale - PADDLE_H / 2;
    this.playerY = Math.max(0, Math.min(COURT_H - PADDLE_H, y));
  }

  private handleKey(e: KeyboardEvent, down: boolean): void {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      this.keys.up = down;
      e.preventDefault();
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      this.keys.down = down;
      e.preventDefault();
    } else if (e.key === ' ' && down) {
      e.preventDefault();
      this.zone.run(() => {
        if (this.state() === 'idle' || this.state() === 'gameover') this.start();
        else this.togglePause();
      });
    }
  }

  private resetPositions(): void {
    this.playerY = COURT_H / 2 - PADDLE_H / 2;
    this.aiY = COURT_H / 2 - PADDLE_H / 2;
    this.ballX = COURT_W / 2;
    this.ballY = COURT_H / 2;
  }

  private serveBall(direction: 1 | -1): void {
    this.ballX = COURT_W / 2;
    this.ballY = COURT_H / 2;
    const angle = (Math.random() * 0.5 - 0.25) * Math.PI;
    const speed = 380;
    this.ballVX = Math.cos(angle) * speed * direction;
    this.ballVY = Math.sin(angle) * speed;
  }

  private runLoop(): void {
    this.lastTime = performance.now();
    this.zone.runOutsideAngular(() => {
      const tick = (now: number) => {
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;
        this.update(dt);
        this.draw();
        if (this.state() === 'running') {
          this.rafId = requestAnimationFrame(tick);
        }
      };
      this.rafId = requestAnimationFrame(tick);
    });
  }

  private update(dt: number): void {
    const paddleSpeed = 420;
    if (this.keys.up) this.playerY -= paddleSpeed * dt;
    if (this.keys.down) this.playerY += paddleSpeed * dt;
    this.playerY = Math.max(0, Math.min(COURT_H - PADDLE_H, this.playerY));

    // AI tracks the ball with a speed cap so it can be beaten
    const aiCenter = this.aiY + PADDLE_H / 2;
    const diff = this.ballY - aiCenter;
    const maxMove = AI_SPEED[this.difficulty()] * dt;
    this.aiY += Math.max(-maxMove, Math.min(maxMove, diff));
    this.aiY = Math.max(0, Math.min(COURT_H - PADDLE_H, this.aiY));

    this.ballX += this.ballVX * dt;
    this.ballY += this.ballVY * dt;

    if (this.ballY - BALL_R < 0) {
      this.ballY = BALL_R;
      this.ballVY = Math.abs(this.ballVY);
    } else if (this.ballY + BALL_R > COURT_H) {
      this.ballY = COURT_H - BALL_R;
      this.ballVY = -Math.abs(this.ballVY);
    }

    // Player paddle (left)
    if (
      this.ballVX < 0 &&
      this.ballX - BALL_R < 30 + PADDLE_W &&
      this.ballX - BALL_R > 30 - 10 &&
      this.ballY > this.playerY - BALL_R &&
      this.ballY < this.playerY + PADDLE_H + BALL_R
    ) {
      this.bounceOffPaddle(this.playerY);
      this.ballVX = Math.abs(this.ballVX);
      this.ballX = 30 + PADDLE_W + BALL_R;
    }

    // AI paddle (right)
    const aiX = COURT_W - 30 - PADDLE_W;
    if (
      this.ballVX > 0 &&
      this.ballX + BALL_R > aiX &&
      this.ballX + BALL_R < aiX + PADDLE_W + 10 &&
      this.ballY > this.aiY - BALL_R &&
      this.ballY < this.aiY + PADDLE_H + BALL_R
    ) {
      this.bounceOffPaddle(this.aiY);
      this.ballVX = -Math.abs(this.ballVX);
      this.ballX = aiX - BALL_R;
    }

    if (this.ballX < -BALL_R * 2) {
      this.zone.run(() => this.scorePoint('ai'));
    } else if (this.ballX > COURT_W + BALL_R * 2) {
      this.zone.run(() => this.scorePoint('player'));
    }
  }

  private bounceOffPaddle(paddleY: number): void {
    // Hit position controls the outgoing angle; each hit speeds the ball up
    const relative = (this.ballY - (paddleY + PADDLE_H / 2)) / (PADDLE_H / 2);
    const speed = Math.min(Math.hypot(this.ballVX, this.ballVY) * 1.05, 900);
    const angle = relative * (Math.PI / 3.5);
    this.ballVX = Math.cos(angle) * speed * Math.sign(this.ballVX || 1);
    this.ballVY = Math.sin(angle) * speed;
  }

  private scorePoint(who: 'player' | 'ai'): void {
    if (who === 'player') this.playerScore.update((s) => s + 1);
    else this.aiScore.update((s) => s + 1);

    if (this.playerScore() >= WIN_SCORE || this.aiScore() >= WIN_SCORE) {
      this.state.set('gameover');
      this.winner.set(who);
      cancelAnimationFrame(this.rafId);
      this.draw();
    } else {
      this.resetPositions();
      this.serveBall(who === 'player' ? -1 : 1);
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, COURT_W, COURT_H);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 14]);
    ctx.beginPath();
    ctx.moveTo(COURT_W / 2, 0);
    ctx.lineTo(COURT_W / 2, COURT_H);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#4fc3f7';
    ctx.fillRect(30, this.playerY, PADDLE_W, PADDLE_H);
    ctx.fillStyle = '#ff8a65';
    ctx.fillRect(COURT_W - 30 - PADDLE_W, this.aiY, PADDLE_W, PADDLE_H);

    if (this.state() === 'running' || this.state() === 'paused') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.ballX, this.ballY, BALL_R, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = 'bold 52px "Roboto", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(this.playerScore()), COURT_W / 2 - 70, 64);
    ctx.fillText(String(this.aiScore()), COURT_W / 2 + 70, 64);
  }
}
