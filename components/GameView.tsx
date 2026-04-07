
import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import gsap from 'gsap';
import { GameConfig, PressureData, GameAction, GameMode, SessionMetrics } from '../types';

interface GameViewProps {
  patientName?: string;
  mvcL?: number;
  mvcR?: number;
  onSessionEnd: (metrics: SessionMetrics) => void;
}

// 使用 globalThis 確保跨模組、跨重新渲染的唯一性
const PIXI_GLOBAL_KEY = '__HOLOBALL_PIXI_APP__';
const PIXI_INIT_KEY = '__HOLOBALL_PIXI_INIT_PROMISE__';

const getOrInitApp = async (): Promise<PIXI.Application> => {
  const g = globalThis as any;

  if (g[PIXI_INIT_KEY]) {
    return g[PIXI_INIT_KEY];
  }

  const app = new PIXI.Application();
  g[PIXI_GLOBAL_KEY] = app;

  g[PIXI_INIT_KEY] = app.init({
    antialias: true,
    autoDensity: true,
    background: 0x000000,
    resolution: window.devicePixelRatio || 1,
    hello: false,
  }).then(() => app);

  return g[PIXI_INIT_KEY];
};

const parseColor = (c: string) => {
  if (!c) return 0xffffff;
  const hex = c.replace(/^0x|^#/, '');
  return parseInt(hex, 16) || 0xffffff;
};

const GameView: React.FC<GameViewProps> = ({ config, pressure, isActive, patientName, mvcL = 1.0, mvcR = 1.0, onSessionEnd }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ config, pressure, isActive });
  const sessionContainerRef = useRef<PIXI.Container | null>(null);
  const leftTargetRef = useRef<PIXI.Container | null>(null);
  const rightTargetRef = useRef<PIXI.Container | null>(null);
  const feedbackContainerRef = useRef<PIXI.Container | null>(null);
  const lastPulseTriggerRef = useRef<number>(0);
  const balanceLineRef = useRef<PIXI.Graphics | null>(null);
  const targetZoneRef = useRef<PIXI.Graphics | null>(null);
  const backgroundSpriteRef = useRef<PIXI.Sprite | null>(null);
  const maintenanceTimerRef = useRef<number>(0);
  const leftMaintenanceTimerRef = useRef<number>(0);
  const rightMaintenanceTimerRef = useRef<number>(0);
  const completedCountsRef = useRef<number>(0);
  const leftProgressRingRef = useRef<PIXI.Graphics | null>(null);
  const rightProgressRingRef = useRef<PIXI.Graphics | null>(null);
  const mainTargetOriginalColorRef = useRef<number>(0xffffff);
  const instructionTextRef = useRef<PIXI.Text | null>(null);
  const compensationWarningRef = useRef<PIXI.Text | null>(null);
  const leftScoreRef = useRef<number>(0);
  const rightScoreRef = useRef<number>(0);
  const leftScoreTextRef = useRef<PIXI.Text | null>(null);
  const rightScoreTextRef = useRef<PIXI.Text | null>(null);
  const rhythmTargetSideRef = useRef<'left' | 'right' | null>(null);
  const rhythmNextTargetTimeRef = useRef<number>(0);
  const rhythmErrorTextRef = useRef<PIXI.Text | null>(0 as any);
  const rhythmTargetMarkerRef = useRef<PIXI.Graphics | null>(null);
  const independentTimerRef = useRef<number>(0);
  const difficultyTextRef = useRef<PIXI.Text | null>(null);
  const hasScoredRef = useRef<boolean>(false);
  const diffWarningTextRef = useRef<PIXI.Text | null>(null);
  const breathingBallRef = useRef<PIXI.Graphics | null>(null);
  const breathingBallOuterRef = useRef<PIXI.Graphics | null>(null);
  const maxPressureRef = useRef<number>(0);
  const maxPressureLRef = useRef<number>(0); // New: Left Hand Peak
  const maxPressureRRef = useRef<number>(0); // New: Right Hand Peak
  const patientLockTextRef = useRef<PIXI.Text | null>(null);
  const calibrationSamplesRef = useRef<{ t: number, l: number, r: number }[]>([]);
  const applyThemeCountRef = useRef<number>(0);

  // 同步狀態到 Ref 避免 Ticker 閉包問題
  useEffect(() => {
    stateRef.current = { config, pressure, isActive };
  }, [config, pressure, isActive]);

  const applyTheme = async (app: PIXI.Application, cfg: GameConfig) => {
    if (!sessionContainerRef.current) return;
    const currentCount = ++applyThemeCountRef.current;

    try {
      // 背景設置
      app.renderer.background.color = parseColor(cfg.theme.bg_color) || 0x111111;
      if (cfg.bg_image_url) {
        try {
          const bgTexture = await PIXI.Assets.load(cfg.bg_image_url);
          if (currentCount !== applyThemeCountRef.current) return;
          
          if (!backgroundSpriteRef.current) {
            backgroundSpriteRef.current = new PIXI.Sprite(bgTexture);
            sessionContainerRef.current.addChildAt(backgroundSpriteRef.current, 0);
          } else {
            backgroundSpriteRef.current.texture = bgTexture;
          }
          const bg = backgroundSpriteRef.current;
          bg.anchor.set(0.5);
          bg.x = app.screen.width / 2;
          bg.y = app.screen.height / 2;
          const scale = Math.max(app.screen.width / bg.texture.width, app.screen.height / bg.texture.height);
          bg.scale.set(scale);
          bg.alpha = 0.5; // Adjusted to user preference
          bg.tint = 0xFFFFFF;
        } catch (e) {
          console.error("BG load error:", e);
        }
      } else if (backgroundSpriteRef.current) {
        sessionContainerRef.current.removeChild(backgroundSpriteRef.current);
        backgroundSpriteRef.current.destroy();
        backgroundSpriteRef.current = null;
      }

      // 清除舊的內容
      if (leftTargetRef.current) {
        sessionContainerRef.current.removeChild(leftTargetRef.current);
        leftTargetRef.current.destroy({ children: true });
        leftTargetRef.current = null;
      }
      if (rightTargetRef.current) {
        sessionContainerRef.current.removeChild(rightTargetRef.current);
        rightTargetRef.current.destroy({ children: true });
        rightTargetRef.current = null;
      }

      leftScoreRef.current = 0;
      rightScoreRef.current = 0;
      maintenanceTimerRef.current = 0;
      leftMaintenanceTimerRef.current = 0;
      rightMaintenanceTimerRef.current = 0;
      hasScoredRef.current = false;
      completedCountsRef.current = 0;
      calibrationSamplesRef.current = [];

      // Initialize or Update Instruction Text
      const min = cfg.logic.target_range?.[0] ?? 0.7;
      const max = cfg.logic.target_range?.[1] ?? 0.8;
      const holdTimeSec = cfg.logic.hold_time ?? 1.0;
      const minEngagement = cfg.logic.min_engagement ?? 0.05;
      const mode = cfg.logic.mode || (cfg.logic.is_independent ? GameMode.INDEPENDENT : GameMode.DUAL);

      let modeStr = '';
      if (mode === GameMode.AVERAGE) modeStr = '合力模式';
      else if (mode === GameMode.DUAL) modeStr = '獨立模式';
      else if (mode === GameMode.INDEPENDENT) modeStr = '節奏模式';
      else if (mode === GameMode.DIFF) modeStr = '平衡模式';
      else modeStr = mode;

      let targetLabel = '目標力道';
      if (mode === GameMode.DIFF) targetLabel = '平衡誤差';
      const instructionStr = `${targetLabel}：${min.toFixed(2)}-${max.toFixed(2)}，維持：${holdTimeSec.toFixed(1)}s\n[模式：${modeStr} | 代償：${minEngagement}]`;

      if (!instructionTextRef.current) {
        instructionTextRef.current = new PIXI.Text({
          text: instructionStr,
          style: {
            fill: 0xffffff,
            fontSize: 20,
            fontWeight: 'bold',
            stroke: { color: 0x000000, width: 4 },
            dropShadow: { color: 0x000000, alpha: 0.8, blur: 4, distance: 2 }
          }
        });
        instructionTextRef.current.anchor.set(0.5, 0);
        sessionContainerRef.current.addChild(instructionTextRef.current);
      } else {
        instructionTextRef.current.text = instructionStr;
      }
      instructionTextRef.current.x = app.screen.width / 2;
      instructionTextRef.current.y = 10;

      // Initialize Compensation Warning
      if (!compensationWarningRef.current) {
        compensationWarningRef.current = new PIXI.Text({
          text: '請雙手同時參與，避免代償！',
          style: {
            fill: 0xFF0000,
            fontSize: 28,
            fontWeight: 'bold',
            stroke: { color: 0x000000, width: 4 }
          }
        });
        compensationWarningRef.current.anchor.set(0.5);
        sessionContainerRef.current.addChild(compensationWarningRef.current);
      }
      compensationWarningRef.current.x = app.screen.width / 2;
      compensationWarningRef.current.y = app.screen.height / 2 + 150;
      compensationWarningRef.current.visible = false;
      // Visual Locking: Patient Name
      if (!patientLockTextRef.current) {
        patientLockTextRef.current = new PIXI.Text({
          text: patientName ? `[患者: ${patientName}]` : '',
          style: {
            fill: 0x888888,
            fontSize: 16,
            fontWeight: 'bold',
            stroke: { color: 0x000000, width: 2 }
          }
        });
        patientLockTextRef.current.anchor.set(1, 1);
        sessionContainerRef.current.addChild(patientLockTextRef.current);
      } else {
        patientLockTextRef.current.text = patientName ? `[患者: ${patientName}]` : '';
      }
      patientLockTextRef.current.x = app.screen.width - 20;
      patientLockTextRef.current.y = app.screen.height - 10;

      // Score Text (Left - Green)
      // Score Text (Left)
      const themeColor = parseColor(cfg.theme.color);
      if (!leftScoreTextRef.current) {
        leftScoreTextRef.current = new PIXI.Text({
          text: `左側達成次數: 0`,
          style: {
            fill: themeColor,
            fontSize: 28,
            fontWeight: 'bold',
            stroke: { color: 0x000000, width: 4 },
            dropShadow: { color: 0x000000, alpha: 0.8, blur: 4, distance: 2 }
          }
        });
        leftScoreTextRef.current.anchor.set(0, 1);
        sessionContainerRef.current.addChild(leftScoreTextRef.current);
      } else {
        leftScoreTextRef.current.style.fill = themeColor;
      }
      leftScoreTextRef.current.x = 40;
      leftScoreTextRef.current.y = app.screen.height - 40;

      const isDual = (mode === GameMode.DUAL || mode === GameMode.INDEPENDENT);
      // 修正：SUM, AVERAGE, DIFF 模式強制顯示左側計分文字做為「總計」
      const isSingleContainer = (mode === GameMode.SUM || mode === GameMode.AVERAGE || mode === GameMode.DIFF);
      const isLeftSide = (cfg.logic.side === 'left' || cfg.logic.side === 'both' || isSingleContainer);

      if (isSingleContainer) {
        leftScoreTextRef.current.anchor.set(0.5, 1);
        leftScoreTextRef.current.x = app.screen.width / 2;
        leftScoreTextRef.current.text = `總達成次數: 0`;
      } else {
        leftScoreTextRef.current.anchor.set(0, 1);
        leftScoreTextRef.current.x = 40;
        leftScoreTextRef.current.text = `左側達成次數: 0`;
      }
      const isCalibration = mode === GameMode.MVC_CALIBRATION;
      leftScoreTextRef.current.visible = isLeftSide && !isCalibration;

      // Score Text (Right)
      if (!rightScoreTextRef.current) {
        rightScoreTextRef.current = new PIXI.Text({
          text: `右側達成次數: 0`,
          style: {
            fill: themeColor,
            fontSize: 28,
            fontWeight: 'bold',
            stroke: { color: 0x000000, width: 4 },
            dropShadow: { color: 0x000000, alpha: 0.8, blur: 4, distance: 2 }
          }
        });
        rightScoreTextRef.current.anchor.set(1, 1);
        sessionContainerRef.current.addChild(rightScoreTextRef.current);
      } else {
        rightScoreTextRef.current.style.fill = themeColor;
      }
      rightScoreTextRef.current.x = app.screen.width - 40;
      rightScoreTextRef.current.y = app.screen.height - 40;
      const isRightSide = (cfg.logic.side === 'right' || cfg.logic.side === 'both' || isSingleContainer); // Added isSingleContainer check here just in case, but usually handled by isDual
      rightScoreTextRef.current.visible = (isDual || isCalibration) && isRightSide && !isCalibration;
      rightScoreTextRef.current.text = `右側達成次數: ${rightScoreRef.current}`;

      // Rhythm Error Text
      if (!rhythmErrorTextRef.current) {
        rhythmErrorTextRef.current = new PIXI.Text({
          text: '請放鬆另一隻手，避免聯帶運動！',
          style: { fill: 0xFF0000, fontSize: 28, fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } }
        });
        rhythmErrorTextRef.current.anchor.set(0.5);
        sessionContainerRef.current.addChild(rhythmErrorTextRef.current);
      }
      rhythmErrorTextRef.current.x = app.screen.width / 2;
      rhythmErrorTextRef.current.y = app.screen.height / 2 + 200;
      rhythmErrorTextRef.current.visible = false;

      // Rhythm Target Marker
      if (!rhythmTargetMarkerRef.current) {
        rhythmTargetMarkerRef.current = new PIXI.Graphics();
        sessionContainerRef.current.addChild(rhythmTargetMarkerRef.current);
      }
      rhythmTargetMarkerRef.current.clear();

      // Difficulty Score Text
      if (!difficultyTextRef.current) {
        difficultyTextRef.current = new PIXI.Text({
          text: `模式：${modeStr} | 難度等級: ${cfg.logic.difficulty_score || 1}`,
          style: {
            fill: 0xFFAA00,
            fontSize: 24,
            fontWeight: 'bold',
            stroke: { color: 0x000000, width: 4 },
            dropShadow: { color: 0x000000, alpha: 0.8, blur: 4, distance: 2 }
          }
        });
        difficultyTextRef.current.anchor.set(1, 0);
        sessionContainerRef.current.addChild(difficultyTextRef.current);
      } else {
        difficultyTextRef.current.text = `模式：${modeStr} | 難度等級: ${cfg.logic.difficulty_score || 1}`;
      }
      difficultyTextRef.current.x = app.screen.width - 20;
      difficultyTextRef.current.y = 10;
      difficultyTextRef.current.visible = true;

      // Diff Warning Text
      if (!diffWarningTextRef.current) {
        diffWarningTextRef.current = new PIXI.Text({
          text: '',
          style: { fill: 0xFF0000, fontSize: 28, fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } }
        });
        diffWarningTextRef.current.anchor.set(0.5);
        sessionContainerRef.current.addChild(diffWarningTextRef.current);
      }
      diffWarningTextRef.current.x = app.screen.width / 2;
      diffWarningTextRef.current.y = app.screen.height / 2 + 100;
      diffWarningTextRef.current.visible = false;

      const createTarget = async (side: 'left' | 'right') => {
        const target = new PIXI.Container();
        const themeColor = parseColor(cfg.theme.color);

        // Always add a base shape for fallback visibility
        const fallback = new PIXI.Graphics();
        fallback.roundRect(-60, -60, 120, 120, 20);
        fallback.fill({ color: themeColor, alpha: 0.2 });
        fallback.setStrokeStyle({ width: 4, color: themeColor, alpha: 0.8 });
        fallback.stroke();
        target.addChild(fallback);

        if (cfg.image_url) {
          try {
            console.log(`Loading image for ${side} target:`, cfg.image_url.substring(0, 50) + "...");
            const texture = await PIXI.Assets.load(cfg.image_url);
            if (currentCount !== applyThemeCountRef.current) return null;
            
            const sprite = new PIXI.Sprite(texture);
            sprite.anchor.set(0.5);
            const maxDim = 150;
            const scale = maxDim / Math.max(sprite.width, sprite.height);
            sprite.scale.set(scale);
            sprite.alpha = 1.0; // Forced HolidayBall Standard
            target.addChild(sprite);
            // If image loaded, we still keep the fallback but make it very subtle
            fallback.alpha = 0.05;
          } catch (e) {
            console.error(`Asset load error for ${side}:`, e);
            // Keep fallback clearly visible if image fails
            fallback.alpha = 0.5;
          }
        }

        sessionContainerRef.current?.addChild(target);
        return target;
      };

      leftTargetRef.current = await createTarget('left');
      if (currentCount !== applyThemeCountRef.current) return;

      if (mode === GameMode.DUAL || mode === GameMode.INDEPENDENT || mode === GameMode.MVC_CALIBRATION) {
        rightTargetRef.current = await createTarget('right');
        if (currentCount !== applyThemeCountRef.current) return;
      }

      // Initialize visual feedback elements
      if (!feedbackContainerRef.current) {
        feedbackContainerRef.current = new PIXI.Container();
        sessionContainerRef.current.addChild(feedbackContainerRef.current);
      }

      // Balance Line (Horizontal Line at Center)
      if (!balanceLineRef.current) {
        const line = new PIXI.Graphics();
        feedbackContainerRef.current.addChild(line);
        balanceLineRef.current = line;
      }
      balanceLineRef.current.clear();
      if (cfg.logic.mode === GameMode.DIFF) {
        balanceLineRef.current.setStrokeStyle({ width: 2, color: 0x555555, alpha: 0.5 });
        balanceLineRef.current.moveTo(app.screen.width * 0.1, app.screen.height / 2);
        balanceLineRef.current.lineTo(app.screen.width * 0.9, app.screen.height / 2);
        balanceLineRef.current.stroke();
      }

      // Target Zone for Navigator Mode
      if (!targetZoneRef.current) {
        const zone = new PIXI.Graphics();
        feedbackContainerRef.current.addChild(zone);
        targetZoneRef.current = zone;
      }
      targetZoneRef.current.clear();

      // Initialize Progress Rings as children of targets
      if (!leftProgressRingRef.current && leftTargetRef.current) {
        leftProgressRingRef.current = new PIXI.Graphics();
        leftTargetRef.current.addChild(leftProgressRingRef.current);
      }
      if (leftProgressRingRef.current) {
        leftProgressRingRef.current.clear();
        leftProgressRingRef.current.visible = isLeftSide;
      }

      if (!rightProgressRingRef.current && rightTargetRef.current) {
        rightProgressRingRef.current = new PIXI.Graphics();
        rightTargetRef.current.addChild(rightProgressRingRef.current);
      }
      if (rightProgressRingRef.current) {
        rightProgressRingRef.current.clear();
        rightProgressRingRef.current.visible = isDual && isRightSide;
      }

      // --- STABLE_HOLD Visuals ---
      if (!breathingBallRef.current) {
        breathingBallRef.current = new PIXI.Graphics();
        sessionContainerRef.current.addChild(breathingBallRef.current);
      }
      if (!breathingBallOuterRef.current) {
        breathingBallOuterRef.current = new PIXI.Graphics();
        sessionContainerRef.current.addChildAt(breathingBallOuterRef.current, 1); // Behind inner ball
      }

      const isStableHold = mode === GameMode.STABLE_HOLD;
      breathingBallRef.current.clear();
      breathingBallOuterRef.current.clear();
      breathingBallRef.current.visible = isStableHold;
      breathingBallOuterRef.current.visible = isStableHold;

      if (isStableHold) {
        // Hide targets and other rings if in blood pressure mode
        if (leftTargetRef.current) leftTargetRef.current.visible = false;
        if (rightTargetRef.current) rightTargetRef.current.visible = false;
        if (leftProgressRingRef.current) leftProgressRingRef.current.visible = false;
        if (rightProgressRingRef.current) rightProgressRingRef.current.visible = false;

        // Initial Draw
        const ballColor = 0x22d3ee; // Cyan
        breathingBallOuterRef.current.circle(0, 0, 150);
        breathingBallOuterRef.current.fill({ color: ballColor, alpha: 0.1 });
        breathingBallOuterRef.current.setStrokeStyle({ width: 2, color: ballColor, alpha: 0.3 });
        breathingBallOuterRef.current.stroke();

        breathingBallRef.current.circle(0, 0, 100);
        breathingBallRef.current.fill({ color: ballColor, alpha: 0.6 });

        breathingBallRef.current.x = app.screen.width / 2;
        breathingBallRef.current.y = app.screen.height / 2;
        breathingBallOuterRef.current.x = app.screen.width / 2;
        breathingBallOuterRef.current.y = app.screen.height / 2;
      }

      // --- Session Timer UI ---
      if (!progressBarRef.current) {
        progressBarRef.current = new PIXI.Graphics();
        sessionContainerRef.current.addChild(progressBarRef.current);
      }
      if (!timerTextRef.current) {
        timerTextRef.current = new PIXI.Text({
          text: '',
          style: {
            fill: 0xffffff,
            fontSize: 18,
            fontWeight: 'bold',
            stroke: { color: 0x000000, width: 3 }
          }
        });
        timerTextRef.current.anchor.set(0, 0);
        sessionContainerRef.current.addChild(timerTextRef.current);
      }
      timerTextRef.current.x = 20;
      timerTextRef.current.y = 10;
      progressBarRef.current.clear();

    } catch (err) {
      console.error("Error applying theme:", err);
    }
  };

  const tickerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let isMounted = true;

    const setup = async () => {
      try {
        const app = await getOrInitApp();
        if (!isMounted || !containerRef.current) return;

        if (app.canvas.parentNode !== containerRef.current) {
          containerRef.current.appendChild(app.canvas);
          app.resizeTo = containerRef.current;
          app.resize();
        }

        const sessionContainer = new PIXI.Container();
        app.stage.addChild(sessionContainer);
        sessionContainerRef.current = sessionContainer;

        // Helper functions for ticker logic - defined inside setup to access refs/app
        const updateTargetAction = (target: PIXI.Container, rawVal: number, cfg: any, app: any) => {
          const targetVal = Math.max(0, Math.min(1, rawVal));
          if (cfg.logic.mode === GameMode.DIFF) {
            // DIFF mode mapping: rotation綁定(right-left) 讓右邊出力時向右(順時針)傾斜
            const diffActual = (stateRef.current.pressure.right - stateRef.current.pressure.left);
            target.rotation = diffActual * 1.2; // 調整旋轉靈敏度
            target.scale.set(1.5);
            return;
          }
          switch (cfg.logic.action) {
            case GameAction.SCALE: target.scale.set(1 + targetVal * 2.5); break;
            case GameAction.MOVE_Y: target.y = (app.screen.height / 2) - (targetVal * (app.screen.height * 0.4)); target.scale.set(1.5); break;
            case GameAction.MOVE_X:
              const centerX = target.x; // Stay in its column
              target.x = centerX + (targetVal * (app.screen.width * 0.1) - (app.screen.width * 0.05));
              target.scale.set(1.5);
              break;
            case GameAction.OPACITY: target.alpha = 0.05 + targetVal * 0.95; target.scale.set(1 + targetVal * 2); break;
            case GameAction.COLOR_SHIFT: target.alpha = 0.6 + targetVal * 0.4; target.scale.set(1.2 + targetVal * 0.8); break;
            case GameAction.ROTATE: target.rotation = targetVal * Math.PI; target.scale.set(2); break;
            case GameAction.PULSE: target.scale.set(1 + targetVal * 0.5); break;
          }
        };

        const updateProgressUI = (target: PIXI.Container, ring: PIXI.Graphics | null, timer: number, required: number, min: number, max: number) => {
          const { config: cfg } = stateRef.current;
          const themeColor = parseColor(cfg.theme.color);
          if (target instanceof PIXI.Container) {
            target.children.forEach(child => { if ('tint' in child) (child as any).tint = themeColor; });
          }
          if (ring) {
            const progress = Math.min(1, timer / required);
            ring.setStrokeStyle({ width: 8, color: themeColor, alpha: 0.8 });
            // Use local (0, 0) coordinates since ring is now a child of the target container
            ring.arc(0, 0, 80, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * progress));
            ring.stroke();
          }
          if (instructionTextRef.current) {
            const progSec = (timer / 1000).toFixed(1);
            const { config: cfg } = stateRef.current;
            const mode = cfg.logic.mode || (cfg.logic.is_independent ? GameMode.INDEPENDENT : GameMode.DUAL);
            let modeStr = '';
            if (mode === GameMode.SUM) modeStr = '合力模式';
            else if (mode === GameMode.AVERAGE) modeStr = '平均模式';
            else if (mode === GameMode.DUAL) modeStr = '雙手獨立';
            else if (mode === GameMode.INDEPENDENT) modeStr = '節奏重置';
            else if (mode === GameMode.DIFF) modeStr = '平衡大師';
            else modeStr = mode;

            let targetLabel = '目標力道';
            if (mode === GameMode.DIFF) targetLabel = '平衡誤差';

            instructionTextRef.current.text = `${targetLabel}：${min.toFixed(2)}-${max.toFixed(2)}，進度：${progSec}s / ${(required / 1000).toFixed(1)}s`;
          }
        };

        const resetTargetTint = (target: PIXI.Container, compensationDetected: boolean) => {
          if (target instanceof PIXI.Container) {
            target.children.forEach(child => { if ('tint' in child) (child as any).tint = (compensationDetected ? 0xFF0000 : 0xFFFFFF); });
          }
        };

        const showSuccessFeedback = (target: PIXI.Container) => {
          const { config: cfg } = stateRef.current;
          const themeColor = parseColor(cfg.theme.color);
          gsap.to(target.scale, { x: target.scale.x * 1.5, y: target.scale.y * 1.5, duration: 0.2, yoyo: true, repeat: 1 });
          const txt = new PIXI.Text({ text: "讚！", style: { fill: themeColor, fontSize: 40, fontWeight: 'bold' } });
          txt.anchor.set(0.5);
          txt.x = target.x; txt.y = target.y - 120;
          feedbackContainerRef.current?.addChild(txt);
          gsap.to(txt, { y: txt.y - 100, alpha: 0, duration: 1, onComplete: () => txt.destroy() });
        };

        const tickerCb = () => {
          const { config: cfg, pressure: prs, isActive: active } = stateRef.current;
          if (!sessionContainerRef.current || !app) return;

          // Normalize pressure for training modes (use raw for calibration)
          const isCalibration = cfg.logic.mode === GameMode.MVC_CALIBRATION;
          const normalizedPrs = isCalibration ? prs : {
            left: prs.left / (mvcL || 1.0),
            right: prs.right / (mvcR || 1.0)
          };

          if (!active) {
            // Reset visibility and reset UI when not active
            if (progressBarRef.current) progressBarRef.current.visible = false;
            if (timerTextRef.current) timerTextRef.current.visible = false;

            const mode = cfg.logic.mode || (cfg.logic.is_independent ? GameMode.INDEPENDENT : GameMode.DUAL);
            [leftTargetRef, rightTargetRef].forEach((ref, i) => {
              if (ref.current) {
                const isSingleContainer = (mode === GameMode.SUM || mode === GameMode.AVERAGE || mode === GameMode.DIFF);
                const isRightSide = (cfg.logic.side === 'right' || isSingleContainer);
                const isLeftSide = (cfg.logic.side === 'left' || cfg.logic.side === 'both' || isSingleContainer);

                const isDualDisplay = (mode === GameMode.DUAL || mode === GameMode.INDEPENDENT || mode === GameMode.MVC_CALIBRATION);
                const visible = (i === 0 && isLeftSide) || (i === 1 && isRightSide && isDualDisplay);

                ref.current.alpha = 0.5;
                ref.current.rotation = 0;
                ref.current.visible = visible;

                if (isSingleContainer) {
                  ref.current.x = app.screen.width / 2;
                } else {
                  ref.current.x = i === 0 ? app.screen.width * 0.25 : app.screen.width * 0.75;
                }
                ref.current.y = app.screen.height / 2;
              }
            });
            return;
          }

          // --- Data Collection ---
          totalPressureLRef.current += prs.left;
          totalPressureRRef.current += prs.right;
          totalSamplesRef.current += 1;

          const mode = cfg.logic.mode || (cfg.logic.is_independent ? GameMode.INDEPENDENT : GameMode.DUAL);
          const minEngagement = cfg.logic.min_engagement ?? 0.05;
          const minForce = cfg.logic.min_force ?? minEngagement;
          const [min, max] = cfg.logic.target_range ?? [0.7, 0.8];
          const requiredHoldTime = (cfg.logic.hold_time ?? 1.0) * 1000;

          // Global UI resets
          if (rhythmTargetMarkerRef.current) rhythmTargetMarkerRef.current.clear();
          if (rhythmErrorTextRef.current) rhythmErrorTextRef.current.visible = false;
          if (compensationWarningRef.current) compensationWarningRef.current.visible = false;
          if (diffWarningTextRef.current) diffWarningTextRef.current.visible = false;
          if (leftProgressRingRef.current) leftProgressRingRef.current.clear();
          if (rightProgressRingRef.current) rightProgressRingRef.current.clear();

          // --- Session Analytics & Timer ---
          const totalDuration = cfg.logic.total_duration || 60;
          const elapsedSec = (performance.now() - sessionStartTimeRef.current) / 1000;
          
          if (cfg.logic.mode === GameMode.MVC_CALIBRATION) {
            calibrationSamplesRef.current.push({ t: elapsedSec, l: prs.left, r: prs.right });
          }
          const remainingSec = Math.max(0, totalDuration - elapsedSec);

          if (progressBarRef.current && timerTextRef.current) {
            const progress = remainingSec / totalDuration;
            const barWidth = app.screen.width * 0.8;
            const barHeight = 8;
            const barX = (app.screen.width - barWidth) / 2;
            const barY = app.screen.height - 20;

            progressBarRef.current.clear();
            // Background
            progressBarRef.current.roundRect(barX, barY, barWidth, barHeight, 4);
            progressBarRef.current.fill({ color: 0x222222, alpha: 0.5 });
            // Foreground (Vacation Gradient substitute: Cyan to Emerald)
            const activeWidth = barWidth * progress;
            progressBarRef.current.roundRect(barX, barY, activeWidth, barHeight, 4);
            progressBarRef.current.fill({ color: 0x00E5FF, alpha: 0.8 }); // Vacation Cyan

            timerTextRef.current.text = `剩餘假期時間: ${Math.ceil(remainingSec)}s`;
            timerTextRef.current.visible = true;
            progressBarRef.current.visible = true;
          }

          if (remainingSec <= 0 && !sessionEndedRef.current) {
            // Session Ended
            sessionEndedRef.current = true;

            let finalL = maxPressureLRef.current;
            let finalR = maxPressureRRef.current;

            if (cfg.logic.mode === GameMode.MVC_CALIBRATION) {
              const samples = calibrationSamplesRef.current;
              // Filter 4s to 8s
              const filtered = samples.filter(s => s.t >= 4 && s.t <= 8);

              const getStableAvg = (hand: 'l' | 'r') => {
                if (filtered.length < 10) return 0;
                let bestAvg = 0;
                let minVar = Infinity;

                // Sliding window 3s
                // Start time s can be from 4.0 to 5.0
                for (let s = 4.0; s <= 5.0; s += 0.1) {
                  const window = filtered.filter(samp => samp.t >= s && samp.t <= s + 3);
                  if (window.length < 5) continue;

                  const values = window.map(samp => samp[hand]);
                  const avg = values.reduce((a, b) => a + b, 0) / values.length;
                  const variance = values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length;

                  if (variance < minVar) {
                    minVar = variance;
                    bestAvg = avg;
                  }
                }
                return bestAvg;
              };

              finalL = Math.min(1.0, getStableAvg('l'));
              finalR = Math.min(1.0, getStableAvg('r'));
            }

            onSessionEnd({
              effectiveSeconds: totalEffectiveMSRef.current / 1000,
              totalSeconds: totalDuration,
              avgPressureL: totalPressureLRef.current / Math.max(1, totalSamplesRef.current),
              avgPressureR: totalPressureRRef.current / Math.max(1, totalSamplesRef.current),
              maxPressure: maxPressureRef.current,
              maxPressureL: finalL,
              maxPressureR: finalR,
              compensationOccurred: compensationCountRef.current > (totalSamplesRef.current * 0.05)
            });
            return;
          }

          // Track Max Pressure
          const currentMax = Math.max(prs.left, prs.right);
          if (currentMax > maxPressureRef.current) maxPressureRef.current = Math.min(1.0, currentMax);
          if (prs.left > maxPressureLRef.current) maxPressureLRef.current = Math.min(1.0, prs.left);
          if (prs.right > maxPressureRRef.current) maxPressureRRef.current = Math.min(1.0, prs.right);

          // MODE LOGIC START
          switch (mode) {
            case GameMode.INDEPENDENT: {
              // Unlock Logic: Both hands must relax below minEngagement to allow next target
              if (hasScoredRef.current) {
                if (prs.left < minEngagement && prs.right < minEngagement) {
                  hasScoredRef.current = false;
                  rhythmTargetSideRef.current = Math.random() > 0.5 ? 'left' : 'right';
                  rhythmNextTargetTimeRef.current = performance.now() + 5000;
                }
              }

              if (rhythmTargetSideRef.current === null) {
                rhythmTargetSideRef.current = Math.random() > 0.5 ? 'left' : 'right';
              }

              const isTargetLeft = rhythmTargetSideRef.current === 'left';
              [leftTargetRef, rightTargetRef].forEach((ref, i) => {
                const target = ref.current;
                if (!target) return;
                const isThisSide = (i === 0 && isTargetLeft) || (i === 1 && isTargetLeft === false);

                // 視覺隱藏：非目標側 visible = false
                const isRightSide = (cfg.logic.side === 'right' || cfg.logic.side === 'both');
                const isLeftSide = (cfg.logic.side === 'left' || cfg.logic.side === 'both');

                target.visible = isThisSide && ((i === 0 && isLeftSide) || (i === 1 && isRightSide));
                if (!target.visible) return;

                // 目標側得分後設為 alpha = 0.2
                target.alpha = hasScoredRef.current ? 0.2 : 1.0;

                target.x = i === 0 ? app.screen.width * 0.25 : app.screen.width * 0.75;
                target.y = app.screen.height / 2;

                if (isThisSide && !hasScoredRef.current) {
                  const val = i === 0 ? normalizedPrs.left : normalizedPrs.right;
                  const oppositeVal = i === 0 ? normalizedPrs.right : normalizedPrs.left;

                  if (rhythmTargetMarkerRef.current) {
                    const themeColor = parseColor(cfg.theme.color);
                    rhythmTargetMarkerRef.current.setStrokeStyle({ width: 4, color: themeColor, alpha: 0.3 });
                    rhythmTargetMarkerRef.current.drawCircle(target.x, target.y, 110);
                    rhythmTargetMarkerRef.current.stroke();
                  }

                  updateTargetAction(target, Math.max(0, Math.min(1, val)), cfg, app);

                  const rawOpposite = i === 0 ? prs.right : prs.left;
                  const success = val >= min && val <= max && rawOpposite < minEngagement;
                  const compensation = val >= min && val <= max && rawOpposite >= minEngagement;

                  if (compensation && rhythmErrorTextRef.current) {
                    rhythmErrorTextRef.current.visible = true;
                    compensationCountRef.current += 1;
                  }

                  if (success) {
                    maintenanceTimerRef.current += app.ticker.deltaMS;
                    totalEffectiveMSRef.current += app.ticker.deltaMS;
                    const ring = i === 0 ? leftProgressRingRef.current : rightProgressRingRef.current;
                    updateProgressUI(target, ring, maintenanceTimerRef.current, requiredHoldTime, min, max);
                    if (maintenanceTimerRef.current >= requiredHoldTime) {
                      maintenanceTimerRef.current = 0;
                      if (i === 0) {
                        leftScoreRef.current++;
                        if (leftScoreTextRef.current) leftScoreTextRef.current.text = `左側達成次數: ${leftScoreRef.current}`;
                      } else {
                        rightScoreRef.current++;
                        if (rightScoreTextRef.current) rightScoreTextRef.current.text = `右側達成次數: ${rightScoreRef.current}`;
                      }
                      hasScoredRef.current = true;
                      showSuccessFeedback(target);
                    }
                  } else {
                    maintenanceTimerRef.current = 0;
                    resetTargetTint(target, compensation);
                  }
                } else if (isThisSide && hasScoredRef.current) {
                  // Already scored but still showing dimmed
                  const val = i === 0 ? normalizedPrs.left : normalizedPrs.right;
                  updateTargetAction(target, Math.max(0, Math.min(1, val)), cfg, app);
                }
              });
              break;
            }

            case GameMode.SUM:
            case GameMode.AVERAGE: {
              const target = leftTargetRef.current;
              if (rightTargetRef.current) rightTargetRef.current.visible = false;
              if (target) {
                target.visible = true;
                target.x = app.screen.width / 2;
                target.y = app.screen.height / 2;

                const val = mode === GameMode.SUM ? (normalizedPrs.left + normalizedPrs.right) : (normalizedPrs.left + normalizedPrs.right) / 2;
                updateTargetAction(target, Math.max(0, Math.min(1, val)), cfg, app);

                const success = val >= min && val <= max && normalizedPrs.left > minEngagement && normalizedPrs.right > minEngagement;
                const compensation = val >= min && val <= max && (normalizedPrs.left <= minEngagement || normalizedPrs.right <= minEngagement);

                if (compensation && compensationWarningRef.current) compensationWarningRef.current.visible = true;

                if (success) {
                  maintenanceTimerRef.current += app.ticker.deltaMS;
                  totalEffectiveMSRef.current += app.ticker.deltaMS;
                  updateProgressUI(target, leftProgressRingRef.current, maintenanceTimerRef.current, requiredHoldTime, min, max);
                  if (maintenanceTimerRef.current >= requiredHoldTime) {
                    maintenanceTimerRef.current = 0;
                    leftScoreRef.current++;
                    if (leftScoreTextRef.current) leftScoreTextRef.current.text = `總達成次數: ${leftScoreRef.current}`;
                    showSuccessFeedback(target);
                  }
                } else {
                  maintenanceTimerRef.current = 0;
                  resetTargetTint(target, compensation);
                }
              }
              break;
            }

            case GameMode.DIFF: {
              const target = leftTargetRef.current;
              if (rightTargetRef.current) rightTargetRef.current.visible = false;
              if (target) {
                target.visible = true;
                if (!target.visible) break;

                target.x = app.screen.width / 2;
                target.y = app.screen.height / 2;
                const diffVal = Math.abs(normalizedPrs.left - normalizedPrs.right);
                updateTargetAction(target, diffVal, cfg, app);

                const success = diffVal >= min && diffVal <= max && normalizedPrs.left >= minForce && normalizedPrs.right >= minForce;
                const balanceIssue = (diffVal > max) && normalizedPrs.left >= minForce && normalizedPrs.right >= minForce;
                const lowForceIssue = normalizedPrs.left < minForce || normalizedPrs.right < minForce;

                if (balanceIssue && diffWarningTextRef.current) {
                  diffWarningTextRef.current.text = normalizedPrs.left > normalizedPrs.right ? '左手太用力了！' : '右手太用力了！';
                  diffWarningTextRef.current.visible = true;
                } else if (lowForceIssue && diffWarningTextRef.current && (prs.left > minEngagement || prs.right > minEngagement)) {
                  diffWarningTextRef.current.text = '請雙手同步加壓至目標力道';
                  diffWarningTextRef.current.visible = true;
                }

                if (success) {
                  maintenanceTimerRef.current += app.ticker.deltaMS;
                  totalEffectiveMSRef.current += app.ticker.deltaMS;
                  updateProgressUI(target, leftProgressRingRef.current, maintenanceTimerRef.current, requiredHoldTime, min, max);
                  if (maintenanceTimerRef.current >= requiredHoldTime) {
                    maintenanceTimerRef.current = 0;
                    leftScoreRef.current++; // Unified score stored in leftScore for single-container modes
                    if (leftScoreTextRef.current) leftScoreTextRef.current.text = `總達成次數: ${leftScoreRef.current}`;
                    showSuccessFeedback(target);
                  }
                } else {
                  maintenanceTimerRef.current = 0;
                  resetTargetTint(target, balanceIssue || lowForceIssue);
                }

                if (instructionTextRef.current && cfg.logic.min_force) {
                    const mf = Math.round(cfg.logic.min_force * 100);
                    const currentText = instructionTextRef.current.text;
                    if (!currentText.includes('最小門檻')) {
                        instructionTextRef.current.text += `\n(啟動平衡最小門檻: ${mf}%)`;
                    }
                }
              }
              break;
            }

            case GameMode.MVC_CALIBRATION: {
              const leftTarget = leftTargetRef.current;
              const rightTarget = rightTargetRef.current;

              if (leftTarget && rightTarget) {
                leftTarget.visible = true;
                rightTarget.visible = true;

                // Position side-by-side for simultaneous view
                leftTarget.x = app.screen.width * 0.35;
                leftTarget.y = app.screen.height / 2;
                rightTarget.x = app.screen.width * 0.65;
                rightTarget.y = app.screen.height / 2;

                updateTargetAction(leftTarget, prs.left, cfg, app);
                updateTargetAction(rightTarget, prs.right, cfg, app);

                const avgSqueeze = (prs.left + prs.right) / 2;

                // In Calibration, effective time is just anytime they are squeezing
                if (avgSqueeze > minEngagement) {
                  totalEffectiveMSRef.current += app.ticker.deltaMS;
                  (leftTarget as any).tint = 0xFFD700;
                  (rightTarget as any).tint = 0xFFD700;
                } else {
                  (leftTarget as any).tint = 0xFFFFFF;
                  (rightTarget as any).tint = 0xFFFFFF;
                }

                if (instructionTextRef.current) {
                  const progSec = elapsedSec.toFixed(1);
                  const pL = Math.round(maxPressureLRef.current * 100);
                  const pR = Math.round(maxPressureRRef.current * 100);
                  
                  let subPrompt = "預備中...";
                  if (elapsedSec < 4) subPrompt = "準備/開始加壓...";
                  else if (elapsedSec <= 8) subPrompt = "【核心穩定持壓中】請保持！";
                  else subPrompt = "即將結束，請穩定握緊...";

                  instructionTextRef.current.text = `今日力道基準校準中：${subPrompt}\n進度：${progSec}s / 10.0s\n(當前峰值 - 左: ${pL}% / 右: ${pR}%)`;
                }
              }
              break;
            }

            case GameMode.STABLE_HOLD: {
              const ball = breathingBallRef.current;
              const outer = breathingBallOuterRef.current;
              if (ball && outer) {
                const val = (normalizedPrs.left + normalizedPrs.right) / 2;
                const targetVal = 0.3;
                const tolerance = 0.05; // ±5%

                // Visual Scaling
                const baseScale = 1.0;
                const targetScale = baseScale + (val * 1.5);
                ball.scale.set(targetScale);

                // Breath effect for outer ring
                const time = performance.now() / 1000;
                const breathScale = 1.0 + Math.sin(time * 2) * 0.05;
                outer.scale.set(breathScale);

                const valL = normalizedPrs.left;
                const valR = normalizedPrs.right;
                const successL = valL >= (targetVal - tolerance) && valL <= (targetVal + tolerance);
                const successR = valR >= (targetVal - tolerance) && valR <= (targetVal + tolerance);
                const success = successL && successR;

                if (success) {
                  maintenanceTimerRef.current += app.ticker.deltaMS;
                  totalEffectiveMSRef.current += app.ticker.deltaMS;

                  // Color feedback
                  (ball as any).tint = 0x34d399; // Emerald
                  (outer as any).tint = 0x34d399;
                } else {
                  maintenanceTimerRef.current = 0;
                  (ball as any).tint = 0x22d3ee; // Cyan
                  (outer as any).tint = 0x22d3ee;

                  const feedback: string[] = [];
                  const getHint = (v: number, raw: number, side: string) => {
                    if (v > (targetVal + tolerance)) return `${side}放鬆一點`;
                    if (v < (targetVal - tolerance) && raw > minEngagement) return `${side}用力一點`;
                    return null;
                  };

                  const hintL = getHint(valL, prs.left, "左手");
                  const hintR = getHint(valR, prs.right, "右手");
                  if (hintL) feedback.push(hintL);
                  if (hintR) feedback.push(hintR);

                  if (feedback.length > 0 && diffWarningTextRef.current) {
                    diffWarningTextRef.current.text = feedback.join('、') + '...';
                    diffWarningTextRef.current.visible = true;
                  }
                }

                if (instructionTextRef.current) {
                  const progSec = (totalEffectiveMSRef.current / 1000).toFixed(1);
                  instructionTextRef.current.text = `降壓訓練：目標 30% (±5%)，已累計有效時間：${progSec}s / ${totalDuration}s`;
                }
              }
              break;
            }

            case GameMode.DUAL:
            default: {
              [leftTargetRef, rightTargetRef].forEach((ref, i) => {
                const target = ref.current;
                if (!target) return;

                const isRightSide = (cfg.logic.side === 'right' || cfg.logic.side === 'both');
                const isLeftSide = (cfg.logic.side === 'left' || cfg.logic.side === 'both');
                target.visible = (i === 0 && isLeftSide) || (i === 1 && isRightSide);

                target.x = i === 0 ? app.screen.width * 0.25 : app.screen.width * 0.75;
                target.y = app.screen.height / 2;
                const val = i === 0 ? normalizedPrs.left : normalizedPrs.right;
                updateTargetAction(target, val, cfg, app);

                const success = val >= min && val <= max;
                if (success) {
                  const timer = i === 0 ? leftMaintenanceTimerRef : rightMaintenanceTimerRef;
                  timer.current += app.ticker.deltaMS;
                  // In DUAL mode, any hand in range contributes to "effective time"
                  if (i === 0 || (i === 1 && !(normalizedPrs.left >= min && normalizedPrs.left <= max))) {
                    totalEffectiveMSRef.current += app.ticker.deltaMS;
                  }

                  const ring = i === 0 ? leftProgressRingRef.current : rightProgressRingRef.current;
                  updateProgressUI(target, ring, timer.current, requiredHoldTime, min, max);
                  if (timer.current >= requiredHoldTime) {
                    timer.current = 0;
                    if (i === 0) {
                      leftScoreRef.current++;
                      if (leftScoreTextRef.current) leftScoreTextRef.current.text = `左側達成次數: ${leftScoreRef.current}`;
                    } else {
                      rightScoreRef.current++;
                      if (rightScoreTextRef.current) rightScoreTextRef.current.text = `右側達成次數: ${rightScoreRef.current}`;
                    }
                    showSuccessFeedback(target);
                  }
                } else {
                  (i === 0 ? leftMaintenanceTimerRef : rightMaintenanceTimerRef).current = 0;
                  resetTargetTint(target, false);
                }
              });
              break;
            }
          }
        };

        if (isMounted) {
          app.ticker.add(tickerCb);
          tickerRef.current = tickerCb;
          if (stateRef.current.config) {
            applyTheme(app, stateRef.current.config);
          }
        }
      } catch (err) {
        console.error("Pixi Setup Error:", err);
      }
    };

    setup();

    return () => {
      isMounted = false;
      const g = globalThis as any;
      const app = g[PIXI_GLOBAL_KEY] as PIXI.Application;
      if (app) {
        if (tickerRef.current) {
          app.ticker.remove(tickerRef.current);
          tickerRef.current = null;
        }
        if (sessionContainerRef.current) {
          app.stage.removeChild(sessionContainerRef.current);
          sessionContainerRef.current.destroy({ children: true });
        }
        if (app.renderer && app.canvas && app.canvas.parentNode === containerRef.current) {
          containerRef.current?.removeChild(app.canvas);
        }
      }
    };
  }, []);

  useEffect(() => {
    const g = globalThis as any;
    const app = g[PIXI_GLOBAL_KEY];
    if (app && config) {
      applyTheme(app, config);
    }
  }, [config]);

  // Session Monitoring
  const sessionStartTimeRef = useRef<number>(0);
  const sessionEndedRef = useRef<boolean>(false);
  const totalEffectiveMSRef = useRef<number>(0);
  const totalPressureLRef = useRef<number>(0);
  const totalPressureRRef = useRef<number>(0);
  const totalSamplesRef = useRef<number>(0);
  const compensationCountRef = useRef<number>(0);
  const progressBarRef = useRef<PIXI.Graphics | null>(null);
  const timerTextRef = useRef<PIXI.Text | null>(null);

  useEffect(() => {
    if (isActive) {
      sessionStartTimeRef.current = performance.now();
      totalEffectiveMSRef.current = 0;
      sessionEndedRef.current = false;
      totalPressureLRef.current = 0;
      totalPressureRRef.current = 0;
      totalSamplesRef.current = 0;
      compensationCountRef.current = 0;
      maxPressureRef.current = 0;
      maxPressureLRef.current = 0;
      maxPressureRRef.current = 0;
    }
  }, [isActive]);

  return (
    <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden bg-amber-950 flex items-center justify-center">
      <div className="text-amber-800 animate-pulse">
        {isActive ? '運作中...' : '渲染引擎就緒'}
      </div>
    </div>
  );
};

export default GameView;
