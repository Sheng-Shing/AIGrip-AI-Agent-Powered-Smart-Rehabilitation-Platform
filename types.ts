
export enum GameMode {
  SUM = 'SUM',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  DIFF = 'DIFF',
  AVERAGE = 'AVERAGE',
  DUAL = 'DUAL',
  INDEPENDENT = 'INDEPENDENT',
  STABLE_HOLD = 'STABLE_HOLD',
  MVC_CALIBRATION = 'MVC_CALIBRATION'
}

export enum GameAction {
  SCALE = 'SCALE',
  MOVE_Y = 'MOVE_Y',
  MOVE_X = 'MOVE_X',
  COLOR_SHIFT = 'COLOR_SHIFT',
  OPACITY = 'OPACITY',
  PULSE = 'PULSE',
  ROTATE = 'ROTATE'
}

export interface GameConfig {
  game_name: string;
  description: string;
  theme: {
    color: string; // Hex string like "0xFF4444"
    bg_color: string;
    asset_description: string;
    image_prompt?: string;
    bg_image_prompt?: string;
    alpha: number;
    bg_alpha: number;
  };
  logic: {
    mode: GameMode;
    action: GameAction;
    side: 'left' | 'right' | 'both';
    target_range?: [number, number];
    hold_time?: number;
    min_engagement?: number;
    is_independent?: boolean;
    difficulty_score?: number;
    path?: { x: number; y: number }[]; // For Navigator mode target zone
    is_calibration?: boolean; // New: Flag for MVC calibration task
    total_duration?: number; // New: Session total duration in seconds
    min_force?: number;      // New: Minimum required force for Balance/Dual modes
  };
  clinical_advice?: string; // New: For proactive guidance messages
  rehab_focus: string;
  difficulty_suggestion: string;
  prescription_summary: string;
  image_url?: string;
  bg_image_url?: string; // New: URL for full scene background
}

export interface SessionMetrics {
  effectiveSeconds: number;
  totalSeconds: number;
  avgPressureL?: number;
  avgPressureR?: number;
  maxPressureL?: number;
  maxPressureR?: number;
  maxPressure?: number;
  compensationOccurred?: boolean;
}

export interface PressureData {
  left: number;
  right: number;
}

export interface Patient {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'other';
  birthYear: number;
  daily_mvc_l?: number; // New: Today's Left Hand MVC
  daily_mvc_r?: number; // New: Today's Right Hand MVC
  last_mvc_timestamp?: number; // New: When the current MVC was recorded
}

export interface SavedPrescription {
  id: string;             // Prescription ID
  timestamp: number;      // Saved time
  game_name: string;      // Game name
  config: GameConfig;     // The JSON Schema
  assets: {
    image_url?: string;    // Main object image
    bg_image_url?: string; // Background image
  };
  raw_prompt: string;     // The input prompt
  best_achievement_rate?: number; // New: Best achievement rate
  force_stability_data?: any;    // New: Force stability data
  patientName?: string;          // New: Patient/Subject name
  patientId?: string;            // New: Link to Patient profile
  metrics?: SessionMetrics;      // New: Detailed session metrics
}
