import { useState } from "react";
import StepClassroom from "./StepClassroom";
import StepRole from "./StepRole";
import type { Classroom } from "../../types";

export default function LoginPage() {
  const [classroom, setClassroom] = useState<Classroom | null>(null);

  if (!classroom) {
    return <StepClassroom onFound={setClassroom} />;
  }
  return <StepRole classroom={classroom} onBack={() => setClassroom(null)} />;
}
