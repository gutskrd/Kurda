/**
 * Learning content hierarchy (KUR-026):
 *   courses → units → skills → lessons → exercises
 *
 * Versioning contract: a PUBLISHED lesson (and its exercises) is
 * immutable at the database level — triggers reject UPDATE/DELETE.
 * Editing means cloning a new (skill, position) row with version+1 in
 * draft. Learner sessions pin a lesson id, so someone mid-lesson when a
 * new version publishes finishes on the version they started (KUR-028).
 */

export const up = (pgm) => {
  pgm.createTable('courses', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    slug: { type: 'text', notNull: true, unique: true },
    /** 'kurmanji' first; sorani/zazaki later — free text by design */
    dialect: { type: 'text', notNull: true, default: 'kurmanji' },
    title_ku: { type: 'text', notNull: true },
    title_en: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('units', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    course_id: { type: 'uuid', notNull: true, references: 'courses', onDelete: 'CASCADE' },
    position: { type: 'integer', notNull: true },
    title_ku: { type: 'text', notNull: true },
    title_en: { type: 'text', notNull: true },
  });
  pgm.addConstraint('units', 'units_course_position_uniq', {
    unique: ['course_id', 'position'],
  });

  pgm.createTable('skills', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    unit_id: { type: 'uuid', notNull: true, references: 'units', onDelete: 'CASCADE' },
    position: { type: 'integer', notNull: true },
    title_ku: { type: 'text', notNull: true },
    title_en: { type: 'text', notNull: true },
    icon: { type: 'text' },
  });
  pgm.addConstraint('skills', 'skills_unit_position_uniq', {
    unique: ['unit_id', 'position'],
  });

  pgm.createTable('lessons', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    skill_id: { type: 'uuid', notNull: true, references: 'skills', onDelete: 'CASCADE' },
    position: { type: 'integer', notNull: true },
    version: { type: 'integer', notNull: true, default: 1 },
    status: {
      type: 'text',
      notNull: true,
      default: 'draft',
      check: "status IN ('draft', 'published', 'archived')",
    },
    title_ku: { type: 'text', notNull: true },
    title_en: { type: 'text', notNull: true },
    published_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('lessons', 'lessons_skill_position_version_uniq', {
    unique: ['skill_id', 'position', 'version'],
  });

  pgm.createTable('exercises', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    lesson_id: { type: 'uuid', notNull: true, references: 'lessons', onDelete: 'CASCADE' },
    position: { type: 'integer', notNull: true },
    type: {
      type: 'text',
      notNull: true,
      check: "type IN ('multiple_choice', 'translate', 'match_pairs')",
    },
    /** validated per-type at authoring time (KUR-027, #27) */
    payload: { type: 'jsonb', notNull: true },
  });
  pgm.addConstraint('exercises', 'exercises_lesson_position_uniq', {
    unique: ['lesson_id', 'position'],
  });

  // -------- published-content immutability --------
  pgm.createFunction(
    'lessons_immutable_when_published',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `BEGIN
       IF TG_OP = 'UPDATE' AND OLD.status = 'published' AND NEW.status = 'archived'
          AND NEW.id = OLD.id AND NEW.version = OLD.version
          AND NEW.title_ku = OLD.title_ku AND NEW.title_en = OLD.title_en THEN
         RETURN NEW; -- retiring a version is the only allowed transition
       END IF;
       IF OLD.status = 'published' THEN
         RAISE EXCEPTION 'published lessons are immutable — create a new version';
       END IF;
       IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
       RETURN NEW;
     END;`,
  );
  pgm.createTrigger('lessons', 'lessons_no_published_rewrite', {
    when: 'BEFORE',
    operation: ['UPDATE', 'DELETE'],
    level: 'ROW',
    function: 'lessons_immutable_when_published',
  });

  pgm.createFunction(
    'exercises_immutable_when_published',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `DECLARE lesson_status text;
     BEGIN
       SELECT status INTO lesson_status FROM lessons
       WHERE id = COALESCE(OLD.lesson_id, NEW.lesson_id);
       IF lesson_status = 'published' THEN
         RAISE EXCEPTION 'exercises of published lessons are immutable — create a new version';
       END IF;
       IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
       RETURN NEW;
     END;`,
  );
  pgm.createTrigger('exercises', 'exercises_no_published_rewrite', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE', 'DELETE'],
    level: 'ROW',
    function: 'exercises_immutable_when_published',
  });
};

export const down = (pgm) => {
  pgm.dropTable('exercises');
  pgm.dropFunction('exercises_immutable_when_published', []);
  pgm.dropTable('lessons');
  pgm.dropFunction('lessons_immutable_when_published', []);
  pgm.dropTable('skills');
  pgm.dropTable('units');
  pgm.dropTable('courses');
};
