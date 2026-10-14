# School database design

## Tables

**`students`** stores one row per student: an `id` (primary key), a `name` and an `email`. The email is `NOT NULL UNIQUE`, so every student has one and no two students can share it. This also makes it a natural way to identify a person, since names can repeat.

**`courses`** stores one row per course: an `id` (primary key), a `title` and the number of `credits`. Title and credits are `NOT NULL`, and a `CHECK` makes sure credits are positive.

**`enrolments`** stores one row per student-on-course. It holds `student_id` and `course_id` (both foreign keys, both `NOT NULL`) and the `grade`. The grade is allowed to be `NULL` because a student is enrolled before they have been graded, and a `CHECK` limits it to 0-100. The primary key is the pair `(student_id, course_id)`, which is the rule that stops the same student enrolling on the same course twice. Both foreign keys use `ON DELETE CASCADE`, so deleting a student or a course also removes their enrolment rows instead of leaving orphans.

## Relationships

- **students to enrolments is one-to-many.** One student can have many enrolments, but each enrolment row belongs to exactly one student.
- **courses to enrolments is one-to-many.** One course can have many enrolments, but each enrolment row belongs to exactly one course.
- **students to courses is many-to-many**, formed by the two relationships above. A student takes many courses, and a course has many students.

A join table is needed because a relational column holds a single value. Putting a `course_id` on `students` would limit a student to one course, and putting a `student_id` on `courses` would limit a course to one student. Storing a list in one column would break the rules of normalisation and make queries, joins and constraints very awkward. The `enrolments` table solves this by turning each pairing into its own row. It is also the natural home for data that belongs to the pairing itself, such as the grade, which is a property of "this student on this course" and not of the student or the course alone.

## Index

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

The primary key `(student_id, course_id)` already gives fast lookups by student (it leads with `student_id`), but a lookup by course alone cannot use it efficiently. Queries such as "all students on this course" and "number of students per course" filter or join on `course_id`, so without this index SQLite would have to scan the whole enrolments table. As enrolments grow into the thousands or millions, that index keeps those queries fast.

## SQL or NoSQL?

I would choose SQL (a relational database) for this system. The data is naturally structured and relational: students, courses and enrolments have fixed fields and clear links between them, and the rules matter. An email must be unique, a student cannot enrol twice on the same course, and an enrolment must never point to a student or course that does not exist. A relational database enforces all of that itself through keys and constraints, rather than relying on every piece of application code to remember it. The queries we need (courses for a student, students on a course, counts per course, students with no enrolments) are joins and aggregations, which SQL is designed for. Transactions also matter for something like enrolment and grading, where a half-finished change would leave records inconsistent. NoSQL would be a stronger choice if the data were unstructured, changed shape constantly, or needed to scale writes across many servers, but none of those apply to a school's records.
