export type GradeLevel = "มัธยมปลาย" | "มัธยมต้น" | "ประถมปลาย" | "ประถมต้น";
export type Role = "teacher" | "treasurer" | "student";

export interface Classroom {
  id: string;
  classroom_identifier: string;
}

export interface StudentMatch {
  id: string;
  student_id: string;
  prefix: string | null;
  first_name: string;
  last_name: string | null;
}

export interface SessionUser {
  role: Role;
  name: string;
  classroomId: string;
  classroomIdentifier: string;
  studentDbId?: string;
}
