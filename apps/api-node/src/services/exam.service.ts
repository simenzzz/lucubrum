/**
 * Exam service for managing timed assessments.
 */

import logger from '../utils/logger';
import { curriculumClient, ExamExerciseSet, Exercise, Grade } from './curriculum-client';
import {
  createExamSession,
  getExamSession,
  completeExamSession,
  createExamAttempt,
  isSessionCompleted,
  isSessionExpired,
} from '../db/queries/exams';
import { getMastery, upsertMastery } from '../db/queries/mastery';
import { getPlanWithNodes, NodeRow } from '../db/queries/plans';

// Default time limit in seconds (30 minutes)
const DEFAULT_TIME_LIMIT_SECONDS = 1800;

// Custom error class
export class ExamServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ExamServiceError';
  }
}

// Input for starting an exam
export interface StartExamInput {
  time_limit_seconds?: number;
}

// Exercise without answers (for client)
export interface ExerciseWithoutAnswer {
  id: string;
  type: string;
  prompt: string;
  difficulty: number;
  choices?: string[];
}

// Result from starting an exam
export interface StartExamResult {
  session_id: string;
  exercises: ExerciseWithoutAnswer[];
  exam_difficulty: number;
  time_limit_seconds: number;
  started_at: Date;
  expires_at: Date;
}

// Answer submission
export interface ExamAnswer {
  exercise_id: string;
  user_answer: unknown;
}

// Grade result for a single exercise
export interface ExerciseGradeResult {
  exercise_id: string;
  score: number;
  is_correct: boolean;
  feedback: string;
  misconceptions: string[];
}

// Mastery update info
export interface MasteryUpdate {
  old: number;
  new: number;
  delta: number;
  level: 'novice' | 'beginner' | 'competent' | 'proficient' | 'expert';
}

// Result from submitting an exam
export interface SubmitExamResult {
  exam_attempt_id: string;
  score: number;
  correct_count: number;
  results: ExerciseGradeResult[];
  mastery_update: MasteryUpdate;
}

/**
 * Get mastery level label from score.
 */
function getMasteryLevel(score: number): MasteryUpdate['level'] {
  if (score < 0.2) return 'novice';
  if (score < 0.4) return 'beginner';
  if (score < 0.6) return 'competent';
  if (score < 0.8) return 'proficient';
  return 'expert';
}

/**
 * Strip sensitive data from exercises for client.
 */
function stripExerciseAnswers(exercises: Exercise[]): ExerciseWithoutAnswer[] {
  return exercises.map((ex) => ({
    id: ex.id,
    type: ex.type,
    prompt: ex.prompt,
    difficulty: ex.difficulty,
    choices: ex.choices,
  }));
}

/**
 * Calculate new mastery score based on exam performance.
 * Formula: newMastery = currentMastery * 0.5 + examScore * 0.5 + perfectBonus
 * where perfectBonus = 0.1 if examScore >= 0.9, else 0
 */
function calculateNewMastery(currentMastery: number, examScore: number): number {
  const perfectBonus = examScore >= 0.9 ? 0.1 : 0;
  const newMastery = currentMastery * 0.5 + examScore * 0.5 + perfectBonus;
  return Math.min(1.0, Math.max(0.0, newMastery));
}

class ExamService {
  /**
   * Start a new exam for a user on a specific node.
   */
  async startExam(
    userId: string,
    planId: string,
    nodeId: string,
    input: StartExamInput,
    requestId: string
  ): Promise<StartExamResult> {
    logger.info(
      { userId, planId, nodeId, requestId },
      'Starting exam'
    );

    // 1. Validate plan/node exist
    const planData = await getPlanWithNodes(planId);
    if (!planData) {
      throw new ExamServiceError(
        `Plan ${planId} not found`,
        404,
        'PLAN_NOT_FOUND',
        { plan_id: planId }
      );
    }

    const node = planData.nodes.find((n) => n.node_id === nodeId);
    if (!node) {
      throw new ExamServiceError(
        `Node ${nodeId} not found in plan ${planId}`,
        404,
        'NODE_NOT_FOUND',
        { plan_id: planId, node_id: nodeId }
      );
    }

    // 2. Get current mastery (default to 0 if not set)
    const masteryRow = await getMastery(userId, planId, nodeId);
    const currentMastery = masteryRow?.mastery_score ?? 0;

    // 3. Call Python service to generate exam
    const examExerciseSet = await this.callCurriculumService(
      planId,
      nodeId,
      planData.plan.topic,
      node,
      planData.plan.user_level as 'beginner' | 'intermediate' | 'advanced',
      currentMastery,
      requestId
    );

    // 4. Create exam session
    const timeLimitSeconds = input.time_limit_seconds ?? DEFAULT_TIME_LIMIT_SECONDS;
    const session = await createExamSession({
      user_id: userId,
      plan_id: planId,
      node_id: nodeId,
      exercises: examExerciseSet.exercises,
      exam_difficulty: examExerciseSet.exam_difficulty,
      time_limit_seconds: timeLimitSeconds,
    });

    // 5. Return exercises without answers
    const exercisesWithoutAnswers = stripExerciseAnswers(examExerciseSet.exercises);

    logger.info(
      { sessionId: session.session_id, exerciseCount: exercisesWithoutAnswers.length },
      'Exam started successfully'
    );

    return {
      session_id: session.session_id,
      exercises: exercisesWithoutAnswers,
      exam_difficulty: examExerciseSet.exam_difficulty,
      time_limit_seconds: session.time_limit_seconds,
      started_at: session.started_at,
      expires_at: session.expires_at,
    };
  }

  /**
   * Submit exam answers and calculate results.
   */
  async submitExam(
    userId: string,
    planId: string,
    nodeId: string,
    sessionId: string,
    answers: ExamAnswer[],
    requestId: string
  ): Promise<SubmitExamResult> {
    logger.info(
      { userId, planId, nodeId, sessionId, requestId, answerCount: answers.length },
      'Submitting exam'
    );

    // 1. Get session
    const session = await getExamSession(sessionId);
    if (!session) {
      throw new ExamServiceError(
        'Exam session not found',
        404,
        'SESSION_NOT_FOUND',
        { session_id: sessionId }
      );
    }

    // 2. Validate session belongs to user
    if (session.user_id !== userId) {
      throw new ExamServiceError(
        'Exam session does not belong to this user',
        403,
        'SESSION_UNAUTHORIZED',
        { session_id: sessionId }
      );
    }

    // 3. Validate session is for the correct plan/node
    if (session.plan_id !== planId || session.node_id !== nodeId) {
      throw new ExamServiceError(
        'Session does not match plan/node',
        400,
        'SESSION_MISMATCH',
        { session_id: sessionId, plan_id: planId, node_id: nodeId }
      );
    }

    // 4. Check if already submitted
    if (await isSessionCompleted(sessionId)) {
      throw new ExamServiceError(
        'Exam has already been submitted',
        400,
        'EXAM_ALREADY_SUBMITTED',
        { session_id: sessionId }
      );
    }

    // 5. Check if expired
    if (await isSessionExpired(sessionId)) {
      throw new ExamServiceError(
        'Exam session has expired',
        400,
        'SESSION_EXPIRED',
        { session_id: sessionId, expires_at: session.expires_at }
      );
    }

    // 6. Get exercises from session
    const exercises = session.exercises as Exercise[];
    const exerciseMap = new Map(exercises.map((ex) => [ex.id, ex]));

    // 7. Grade each answer
    const gradeResults: ExerciseGradeResult[] = [];
    let correctCount = 0;

    for (const answer of answers) {
      const exercise = exerciseMap.get(answer.exercise_id);
      if (!exercise) {
        logger.warn(
          { exerciseId: answer.exercise_id, sessionId },
          'Answer for unknown exercise'
        );
        continue;
      }

      // Grade the answer
      const gradeResult = await this.gradeAnswer(
        planId,
        nodeId,
        exercise,
        answer.user_answer,
        session.user_id,
        requestId
      );

      gradeResults.push({
        exercise_id: answer.exercise_id,
        score: gradeResult.score,
        is_correct: gradeResult.is_correct,
        feedback: gradeResult.feedback,
        misconceptions: gradeResult.misconceptions || [],
      });

      if (gradeResult.is_correct) {
        correctCount++;
      }
    }

    // 8. Calculate exam score
    const totalExercises = exercises.length;
    const examScore = totalExercises > 0 ? correctCount / totalExercises : 0;

    // 9. Get current mastery and calculate new mastery
    const masteryRow = await getMastery(userId, planId, nodeId);
    const oldMastery = masteryRow?.mastery_score ?? 0;
    const newMastery = calculateNewMastery(oldMastery, examScore);

    // 10. Update mastery
    await upsertMastery(userId, planId, nodeId, newMastery);

    // 11. Mark session as completed
    await completeExamSession(sessionId);

    // 12. Create exam attempt record
    const attempt = await createExamAttempt({
      session_id: sessionId,
      user_id: userId,
      plan_id: planId,
      node_id: nodeId,
      mastery_level_old: oldMastery,
      mastery_level_new: newMastery,
      exam_difficulty: session.exam_difficulty,
      score: examScore,
      exercises_count: totalExercises,
      correct_count: correctCount,
      answers: answers,
      grades: gradeResults,
      started_at: session.started_at,
      completed_at: new Date(),
      time_limit_seconds: session.time_limit_seconds,
    });

    const masteryUpdate: MasteryUpdate = {
      old: oldMastery,
      new: newMastery,
      delta: newMastery - oldMastery,
      level: getMasteryLevel(newMastery),
    };

    logger.info(
      {
        attemptId: attempt.exam_attempt_id,
        sessionId,
        score: examScore,
        correctCount,
        totalExercises,
        masteryUpdate,
      },
      'Exam submitted successfully'
    );

    return {
      exam_attempt_id: attempt.exam_attempt_id,
      score: examScore,
      correct_count: correctCount,
      results: gradeResults,
      mastery_update: masteryUpdate,
    };
  }

  /**
   * Call the Python curriculum service to generate an exam.
   */
  private async callCurriculumService(
    planId: string,
    nodeId: string,
    topic: string,
    node: NodeRow,
    userLevel: 'beginner' | 'intermediate' | 'advanced',
    currentMastery: number,
    requestId: string
  ): Promise<ExamExerciseSet> {
    try {
      return await curriculumClient.generateExam({
        plan_id: planId,
        node_id: nodeId,
        topic,
        node_title: node.title,
        objectives: node.objectives,
        user_level: userLevel,
        current_mastery: currentMastery,
        exercise_count: 10,
        request_id: requestId,
      });
    } catch (error) {
      logger.error({ planId, nodeId, error }, 'Curriculum service call failed');

      if (
        error instanceof Error &&
        'statusCode' in error &&
        'errorCode' in error
      ) {
        const serviceError = error as unknown as {
          statusCode: number;
          errorCode: string;
          message: string;
        };

        throw new ExamServiceError(
          serviceError.message,
          serviceError.statusCode,
          serviceError.errorCode,
          { plan_id: planId, node_id: nodeId }
        );
      }

      throw new ExamServiceError(
        'Failed to generate exam',
        500,
        'EXAM_GENERATION_FAILED',
        { plan_id: planId, node_id: nodeId }
      );
    }
  }

  /**
   * Grade a single answer.
   * Uses local grading for MCQ, Python service for other types.
   */
  private async gradeAnswer(
    planId: string,
    nodeId: string,
    exercise: Exercise,
    userAnswer: unknown,
    _userId: string,
    requestId: string
  ): Promise<Grade> {
    // For MCQ, do local grading
    if (exercise.type === 'mcq') {
      const isCorrect = userAnswer === exercise.correct_answer;
      return {
        schema_version: 'grade.v1',
        plan_id: planId,
        node_id: nodeId,
        exercise_id: exercise.id,
        score: isCorrect ? 1.0 : 0.0,
        is_correct: isCorrect,
        feedback: isCorrect
          ? 'Correct!'
          : `Incorrect. The correct answer is: ${exercise.correct_answer}`,
        misconceptions: null,
        metadata: {
          provider: 'local',
          model: 'mcq-grader',
          prompt_version: 'n/a',
          created_at: new Date().toISOString(),
          request_id: requestId,
          raw_output_hash: '',
          artifact_hash: '',
          validation_retry_count: 0,
        },
      };
    }

    // For fill_blank, do local grading with flexible matching
    if (exercise.type === 'fill_blank') {
      const correctAnswer = exercise.correct_answer as {
        answers: string[];
        match: 'case_sensitive' | 'case_insensitive';
        normalize_whitespace: boolean;
      };

      let userAnswerStr = String(userAnswer);
      let answers = correctAnswer.answers;

      if (correctAnswer.normalize_whitespace) {
        userAnswerStr = userAnswerStr.trim().replace(/\s+/g, ' ');
        answers = answers.map((a) => a.trim().replace(/\s+/g, ' '));
      }

      if (correctAnswer.match === 'case_insensitive') {
        userAnswerStr = userAnswerStr.toLowerCase();
        answers = answers.map((a) => a.toLowerCase());
      }

      const isCorrect = answers.includes(userAnswerStr);
      return {
        schema_version: 'grade.v1',
        plan_id: planId,
        node_id: nodeId,
        exercise_id: exercise.id,
        score: isCorrect ? 1.0 : 0.0,
        is_correct: isCorrect,
        feedback: isCorrect
          ? 'Correct!'
          : `Incorrect. Acceptable answers include: ${correctAnswer.answers.slice(0, 3).join(', ')}`,
        misconceptions: null,
        metadata: {
          provider: 'local',
          model: 'fill-blank-grader',
          prompt_version: 'n/a',
          created_at: new Date().toISOString(),
          request_id: requestId,
          raw_output_hash: '',
          artifact_hash: '',
          validation_retry_count: 0,
        },
      };
    }

    // For flashcard, do simple string comparison
    if (exercise.type === 'flashcard') {
      const correctAnswer = String(exercise.correct_answer).toLowerCase().trim();
      const userAnswerStr = String(userAnswer).toLowerCase().trim();
      // Simple similarity - contains key terms
      const isCorrect =
        userAnswerStr === correctAnswer ||
        correctAnswer.split(' ').filter((w) => w.length > 3).every((word) => userAnswerStr.includes(word));
      return {
        schema_version: 'grade.v1',
        plan_id: planId,
        node_id: nodeId,
        exercise_id: exercise.id,
        score: isCorrect ? 1.0 : 0.0,
        is_correct: isCorrect,
        feedback: isCorrect
          ? 'Correct!'
          : `The expected answer was: ${exercise.correct_answer}`,
        misconceptions: null,
        metadata: {
          provider: 'local',
          model: 'flashcard-grader',
          prompt_version: 'n/a',
          created_at: new Date().toISOString(),
          request_id: requestId,
          raw_output_hash: '',
          artifact_hash: '',
          validation_retry_count: 0,
        },
      };
    }

    // For short_answer and coding, use Python grading service
    try {
      return await curriculumClient.gradeAnswer({
        plan_id: planId,
        node_id: nodeId,
        exercise_id: exercise.id,
        exercise_type: exercise.type as 'short_answer' | 'coding',
        prompt: exercise.prompt,
        rubric: exercise.rubric,
        correct_answer: exercise.correct_answer,
        user_answer: userAnswer,
        user_level: 'intermediate', // Default for exam grading
        request_id: requestId,
      });
    } catch (error) {
      logger.error(
        { exerciseId: exercise.id, exerciseType: exercise.type, error },
        'Grading failed, defaulting to incorrect'
      );

      // Default to incorrect if grading fails
      return {
        schema_version: 'grade.v1',
        plan_id: planId,
        node_id: nodeId,
        exercise_id: exercise.id,
        score: 0.0,
        is_correct: false,
        feedback: 'Unable to grade this answer. Please try again.',
        misconceptions: null,
        metadata: {
          provider: 'error',
          model: 'fallback',
          prompt_version: 'n/a',
          created_at: new Date().toISOString(),
          request_id: requestId,
          raw_output_hash: '',
          artifact_hash: '',
          validation_retry_count: 0,
        },
      };
    }
  }
}

// Export singleton instance
export const examService = new ExamService();
export default examService;
