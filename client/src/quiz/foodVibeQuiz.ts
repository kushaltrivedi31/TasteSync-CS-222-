/**
 * The food vibe quiz: five questions about music and what you want right now,
 * scored with simple, published points. It is a playful way to land on one of
 * TasteSync's five moods. It is not a psychological or mood assessment, and no
 * single answer (such as a genre) is treated as evidence of how someone feels.
 *
 * Scoring rules (also documented in README.md):
 * 1. Each answer gives 0–2 points to one or more moods.
 * 2. The mood with the most points is suggested.
 * 3. Ties go to the tied mood that scored higher on the most recent question,
 *    checking Q5 first, then Q4, and so on back to Q1, because later questions
 *    ask about what you want right now.
 * 4. If still tied, the earlier mood in MOODS order wins
 *    (upbeat, calm, stressed, low-energy, adventurous).
 */
import { MOODS, type Mood } from "../../../shared/moods";

export interface QuizOption {
  id: string;
  label: string;
  /** Points this answer gives each mood (moods not listed get 0). */
  points: Partial<Record<Mood, number>>;
  /** Phrase used in the result explanation, completing "you …". */
  reason: string;
}

export interface QuizQuestion {
  id: string;
  /** What the question is about, shown above the prompt. */
  topic: string;
  prompt: string;
  options: QuizOption[];
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "music",
    topic: "Music preferences",
    prompt: "What would you put on right now?",
    options: [
      {
        id: "pop-dance",
        label: "Big pop or dance tracks",
        points: { upbeat: 2 },
        reason: "reached for big pop or dance tracks",
      },
      {
        id: "lofi-acoustic",
        label: "Lo-fi, acoustic, or ambient",
        points: { calm: 2, "low-energy": 1 },
        reason: "went for lo-fi, acoustic, or ambient sounds",
      },
      {
        id: "focus",
        label: "Background music so I can focus",
        points: { stressed: 2 },
        reason: "wanted background music to help you focus",
      },
      {
        id: "new-genre",
        label: "A genre or artist I just discovered",
        points: { adventurous: 2 },
        reason: "picked a genre or artist you just discovered",
      },
      {
        id: "quiet",
        label: "Nothing, I'd rather have quiet",
        points: { "low-energy": 2, calm: 1 },
        reason: "would rather have quiet",
      },
    ],
  },
  {
    id: "energy",
    topic: "Preferred energy",
    prompt: "How much energy should your next song have?",
    options: [
      {
        id: "high",
        label: "High: loud and fast",
        points: { upbeat: 2, adventurous: 1 },
        reason: "want high-energy music",
      },
      {
        id: "steady",
        label: "Steady: a good groove that stays out of the way",
        points: { stressed: 1, calm: 1 },
        reason: "want a steady groove that stays out of the way",
      },
      {
        id: "low",
        label: "Low: slow and soft",
        points: { "low-energy": 2, calm: 1 },
        reason: "want slow, soft music",
      },
    ],
  },
  {
    id: "familiarity",
    topic: "Familiar favorites vs discovery",
    prompt: "Familiar favorites or something new?",
    options: [
      {
        id: "favorites",
        label: "My favorites on repeat",
        points: { "low-energy": 1, stressed: 1 },
        reason: "like your favorites on repeat",
      },
      {
        id: "mix",
        label: "A mix of both",
        points: { upbeat: 1, calm: 1 },
        reason: "like a mix of old and new",
      },
      {
        id: "new",
        label: "Something I've never heard",
        points: { adventurous: 2 },
        reason: "want something you've never heard",
      },
    ],
  },
  {
    id: "occasion",
    topic: "Listening occasion",
    prompt: "Where is this music playing?",
    options: [
      {
        id: "going-out",
        label: "Getting ready to go out with friends",
        points: { upbeat: 2 },
        reason: "are getting ready to go out with friends",
      },
      {
        id: "studying",
        label: "Studying or working on a deadline",
        points: { stressed: 2 },
        reason: "are studying or working on a deadline",
      },
      {
        id: "winding-down",
        label: "Winding down at home",
        points: { calm: 2, "low-energy": 1 },
        reason: "are winding down at home",
      },
      {
        id: "recharging",
        label: "On the couch, recharging",
        points: { "low-energy": 2 },
        reason: "are on the couch recharging",
      },
      {
        id: "exploring",
        label: "Exploring somewhere new",
        points: { adventurous: 2 },
        reason: "are out exploring somewhere new",
      },
    ],
  },
  {
    id: "experience",
    topic: "What you want right now",
    prompt: "What do you want from your next meal?",
    options: [
      {
        id: "share",
        label: "Something fun to share",
        points: { upbeat: 2 },
        reason: "want something fun to share",
      },
      {
        id: "slow-down",
        label: "Something cozy to slow down with",
        points: { calm: 2 },
        reason: "want something cozy to slow down with",
      },
      {
        id: "quick",
        label: "Fast and easy so I can get back to things",
        points: { stressed: 2 },
        reason: "want food that's fast and easy",
      },
      {
        id: "no-effort",
        label: "As little effort as possible",
        points: { "low-energy": 2 },
        reason: "want as little effort as possible",
      },
      {
        id: "new-to-me",
        label: "Something I haven't tried before",
        points: { adventurous: 2 },
        reason: "want to try something new",
      },
    ],
  },
];

/** Selected option id for each question id. */
export type QuizAnswers = Partial<Record<string, string>>;

export interface QuizResult {
  mood: Mood;
  scores: Record<Mood, number>;
  /** Reasons from the answers that gave the suggested mood points, strongest first (max 3). */
  reasons: string[];
  /** Set when a tie was broken: which question decided it, or "order" for the fixed fallback. */
  tieBreak?: { tiedMoods: Mood[]; decidedBy: string };
}

function emptyScores(): Record<Mood, number> {
  return { upbeat: 0, calm: 0, stressed: 0, "low-energy": 0, adventurous: 0 };
}

function selectedOption(question: QuizQuestion, answers: QuizAnswers): QuizOption | undefined {
  return question.options.find((option) => option.id === answers[question.id]);
}

export function isQuizComplete(answers: QuizAnswers, questions = QUIZ_QUESTIONS): boolean {
  return questions.every((question) => selectedOption(question, answers) !== undefined);
}

/**
 * Scores a completed quiz. Throws if any question is unanswered, so a result is
 * never produced from partial answers.
 */
export function scoreQuiz(answers: QuizAnswers, questions = QUIZ_QUESTIONS): QuizResult {
  const scores = emptyScores();
  const chosen = questions.map((question) => {
    const option = selectedOption(question, answers);
    if (!option) throw new Error(`Question "${question.id}" has not been answered`);
    for (const mood of MOODS) scores[mood] += option.points[mood] ?? 0;
    return { question, option };
  });

  const top = Math.max(...MOODS.map((mood) => scores[mood]));
  let tied = MOODS.filter((mood) => scores[mood] === top);
  let tieBreak: QuizResult["tieBreak"];

  if (tied.length > 1) {
    const tiedMoods = [...tied];
    // Most recent question first.
    for (const { question, option } of [...chosen].reverse()) {
      const best = Math.max(...tied.map((mood) => option.points[mood] ?? 0));
      const narrowed = tied.filter((mood) => (option.points[mood] ?? 0) === best);
      if (narrowed.length < tied.length) {
        tied = narrowed;
        if (tied.length === 1) {
          tieBreak = { tiedMoods, decidedBy: question.id };
          break;
        }
      }
    }
    if (tied.length > 1) tieBreak = { tiedMoods, decidedBy: "order" };
  }

  const mood = tied[0]!;
  const reasons = chosen
    .filter(({ option }) => (option.points[mood] ?? 0) > 0)
    .sort((a, b) => (b.option.points[mood] ?? 0) - (a.option.points[mood] ?? 0))
    .slice(0, 3)
    .map(({ option }) => option.reason);

  return { mood, scores, reasons, ...(tieBreak ? { tieBreak } : {}) };
}

/** Joins reasons into readable English: "a", "a and b", "a, b, and c". */
export function joinReasons(reasons: string[]): string {
  if (reasons.length <= 1) return reasons[0] ?? "";
  if (reasons.length === 2) return `${reasons[0]} and ${reasons[1]}`;
  return `${reasons.slice(0, -1).join(", ")}, and ${reasons[reasons.length - 1]}`;
}
