DO $migration$
BEGIN
  CREATE TABLE __SCHEMA__.colleges (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_at timestamptz,
    version integer NOT NULL DEFAULT 0,
    name text NOT NULL,
    sort integer NOT NULL DEFAULT 0,
    CONSTRAINT colleges_version_check CHECK (version >= 0),
    CONSTRAINT colleges_name_check CHECK (length(btrim(name)) > 0)
  );
  CREATE UNIQUE INDEX colleges_name_active_unique ON __SCHEMA__.colleges (name) WHERE deleted_at IS NULL;
  CREATE TABLE __SCHEMA__.majors (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_at timestamptz,
    version integer NOT NULL DEFAULT 0,
    college_id uuid NOT NULL REFERENCES __SCHEMA__.colleges(id),
    name text NOT NULL,
    CONSTRAINT majors_version_check CHECK (version >= 0),
    CONSTRAINT majors_name_check CHECK (length(btrim(name)) > 0),
    UNIQUE(id,college_id)
  );
  CREATE UNIQUE INDEX majors_college_name_active_unique ON __SCHEMA__.majors (college_id, name) WHERE deleted_at IS NULL;
  CREATE TABLE __SCHEMA__.classes (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_at timestamptz,
    version integer NOT NULL DEFAULT 0,
    stage integer NOT NULL,
    entry_year integer NOT NULL,
    class_no integer NOT NULL,
    name text,
    college_id uuid REFERENCES __SCHEMA__.colleges(id),
    major_id uuid,
    status smallint NOT NULL DEFAULT 1,
    CONSTRAINT classes_version_check CHECK (version >= 0),
    CONSTRAINT classes_stage_check CHECK (stage IN (1,2,3,4)),
    CONSTRAINT classes_entry_year_check CHECK (entry_year BETWEEN 1 AND 9998),
    CONSTRAINT classes_class_no_check CHECK (class_no > 0),
    CONSTRAINT classes_status_check CHECK (status IN (0,1)),
    CONSTRAINT classes_college_major_check CHECK ((stage = 4 AND college_id IS NOT NULL AND major_id IS NOT NULL) OR (stage <> 4 AND college_id IS NULL AND major_id IS NULL)),
    FOREIGN KEY(major_id,college_id) REFERENCES __SCHEMA__.majors(id,college_id)
  );
  CREATE UNIQUE INDEX classes_grade_no_active_unique ON __SCHEMA__.classes (stage, entry_year, class_no, major_id) WHERE deleted_at IS NULL AND major_id IS NOT NULL;
  CREATE UNIQUE INDEX classes_grade_no_without_major_active_unique ON __SCHEMA__.classes (stage, entry_year, class_no) WHERE deleted_at IS NULL AND major_id IS NULL;
  CREATE INDEX classes_college_id_idx ON __SCHEMA__.classes(college_id) WHERE deleted_at IS NULL;
  CREATE INDEX classes_major_id_idx ON __SCHEMA__.classes(major_id) WHERE deleted_at IS NULL;
  CREATE TABLE __SCHEMA__.teaching_classes (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_at timestamptz,
    version integer NOT NULL DEFAULT 0,
    academic_year_id uuid NOT NULL,
    semester_id uuid NOT NULL,
    name text NOT NULL,
    sport_item_code text,
    status smallint NOT NULL DEFAULT 1,
    CONSTRAINT teaching_classes_version_check CHECK (version >= 0),
    CONSTRAINT teaching_classes_name_check CHECK (length(btrim(name)) > 0),
    CONSTRAINT teaching_classes_status_check CHECK (status IN (0,1))
  );
  CREATE INDEX teaching_classes_academic_year_id_idx ON __SCHEMA__.teaching_classes(academic_year_id) WHERE deleted_at IS NULL;
  CREATE INDEX teaching_classes_semester_id_idx ON __SCHEMA__.teaching_classes(semester_id) WHERE deleted_at IS NULL;
  CREATE TABLE __SCHEMA__.students (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_at timestamptz,
    version integer NOT NULL DEFAULT 0,
    student_no text NOT NULL,
    name text NOT NULL,
    gender smallint NOT NULL,
    birthday timestamptz NOT NULL,
    id_type text NOT NULL,
    id_card_enc text NOT NULL,
    id_card_hash varchar(64) NOT NULL,
    class_id uuid NOT NULL REFERENCES __SCHEMA__.classes(id),
    status text NOT NULL DEFAULT 'studying',
    student_index_id uuid NOT NULL,
    CONSTRAINT students_version_check CHECK (version >= 0),
    CONSTRAINT students_student_no_check CHECK (length(btrim(student_no)) > 0),
    CONSTRAINT students_name_check CHECK (length(btrim(name)) > 0),
    CONSTRAINT students_gender_check CHECK (gender IN (1,2)),
    CONSTRAINT students_document_check CHECK (length(btrim(id_type)) > 0 AND length(id_card_enc) > 0 AND id_card_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT students_status_check CHECK (status IN ('studying','transferred_out','graduated','suspended'))
  );
  CREATE UNIQUE INDEX students_student_no_active_unique ON __SCHEMA__.students (student_no) WHERE deleted_at IS NULL;
  CREATE INDEX students_class_id_idx ON __SCHEMA__.students(class_id) WHERE deleted_at IS NULL;
  CREATE INDEX students_student_index_id_idx ON __SCHEMA__.students(student_index_id) WHERE deleted_at IS NULL;
  CREATE TABLE __SCHEMA__.teaching_class_students (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_at timestamptz,
    version integer NOT NULL DEFAULT 0,
    teaching_class_id uuid NOT NULL REFERENCES __SCHEMA__.teaching_classes(id),
    student_id uuid NOT NULL REFERENCES __SCHEMA__.students(id),
    CONSTRAINT teaching_class_students_version_check CHECK (version >= 0)
  );
  CREATE UNIQUE INDEX teaching_class_students_class_student_active_unique ON __SCHEMA__.teaching_class_students (teaching_class_id, student_id) WHERE deleted_at IS NULL;
  CREATE INDEX teaching_class_students_student_id_idx ON __SCHEMA__.teaching_class_students(student_id) WHERE deleted_at IS NULL;
  CREATE TABLE __SCHEMA__.student_enrollments (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_at timestamptz,
    version integer NOT NULL DEFAULT 0,
    student_id uuid NOT NULL REFERENCES __SCHEMA__.students(id),
    academic_year_id uuid NOT NULL,
    class_id uuid NOT NULL REFERENCES __SCHEMA__.classes(id),
    CONSTRAINT student_enrollments_version_check CHECK (version >= 0)
  );
  CREATE UNIQUE INDEX student_enrollments_student_year_active_unique ON __SCHEMA__.student_enrollments (student_id, academic_year_id) WHERE deleted_at IS NULL;
  CREATE INDEX student_enrollments_academic_year_id_idx ON __SCHEMA__.student_enrollments(academic_year_id) WHERE deleted_at IS NULL;
  CREATE INDEX student_enrollments_class_id_idx ON __SCHEMA__.student_enrollments(class_id) WHERE deleted_at IS NULL;
  CREATE TABLE __SCHEMA__.teacher_profiles (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_at timestamptz,
    version integer NOT NULL DEFAULT 0,
    identity_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    gender smallint NOT NULL,
    phone_enc text,
    phone_hash varchar(64),
    CONSTRAINT teacher_profiles_version_check CHECK (version >= 0),
    CONSTRAINT teacher_profiles_name_check CHECK (length(btrim(name)) > 0),
    CONSTRAINT teacher_profiles_gender_check CHECK (gender IN (1,2)),
    CONSTRAINT teacher_profiles_phone_pair_check CHECK ((phone_enc IS NULL) = (phone_hash IS NULL)),
    CONSTRAINT teacher_profiles_phone_hash_check CHECK (phone_hash ~ '^[0-9a-f]{64}$')
  );
  CREATE UNIQUE INDEX teacher_profiles_identity_active_unique ON __SCHEMA__.teacher_profiles (identity_id) WHERE deleted_at IS NULL;
  CREATE INDEX teacher_profiles_user_id_idx ON __SCHEMA__.teacher_profiles(user_id) WHERE deleted_at IS NULL;
  CREATE TABLE __SCHEMA__.teacher_assignments (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_at timestamptz,
    version integer NOT NULL DEFAULT 0,
    teacher_profile_id uuid NOT NULL REFERENCES __SCHEMA__.teacher_profiles(id),
    class_kind text NOT NULL,
    class_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    semester_id uuid,
    subject text NOT NULL DEFAULT 'pe',
    is_head boolean NOT NULL DEFAULT false,
    CONSTRAINT teacher_assignments_version_check CHECK (version >= 0),
    CONSTRAINT teacher_assignments_class_kind_check CHECK (class_kind IN ('admin','teaching')),
    CONSTRAINT teacher_assignments_semester_check CHECK ((class_kind = 'admin' AND semester_id IS NULL) OR (class_kind = 'teaching' AND semester_id IS NOT NULL)),
    CONSTRAINT teacher_assignments_subject_check CHECK (length(btrim(subject)) > 0)
  );
  CREATE UNIQUE INDEX teacher_assignments_teaching_active_unique ON __SCHEMA__.teacher_assignments (teacher_profile_id, class_kind, class_id, academic_year_id, semester_id, subject) WHERE deleted_at IS NULL AND semester_id IS NOT NULL;
  CREATE UNIQUE INDEX teacher_assignments_admin_active_unique ON __SCHEMA__.teacher_assignments (teacher_profile_id, class_kind, class_id, academic_year_id, subject) WHERE deleted_at IS NULL AND semester_id IS NULL;
  CREATE INDEX teacher_assignments_class_id_idx ON __SCHEMA__.teacher_assignments(class_id) WHERE deleted_at IS NULL;
  CREATE INDEX teacher_assignments_academic_year_id_idx ON __SCHEMA__.teacher_assignments(academic_year_id) WHERE deleted_at IS NULL;
  CREATE INDEX teacher_assignments_semester_id_idx ON __SCHEMA__.teacher_assignments(semester_id) WHERE deleted_at IS NULL;
END
$migration$;
