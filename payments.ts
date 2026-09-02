import { supabase } from "../supabase";

export interface WeeklyPaymentRow {
  id: string;
  student_id: string;
  week: number;
  amount: number;
  status: "paid" | "unpaid";
  paid_at: string | null;
  recorded_by: string | null;
  students: { id: string; student_id: string; prefix: string | null; first_name: string; last_name: string | null };
}

export interface FundSummary {
  balance: number;
  total_income: number;
  total_expense: number;
  income_this_week: number;
  expense_this_week: number;
  paid_count: number;
  student_count: number;
}

export async function ensureWeekPayments(classroomId: string, week: number) {
  const { error } = await supabase.rpc("ensure_week_payments", {
    p_classroom_id: classroomId,
    p_week: week,
  });
  if (error) throw error;
}

export async function fetchWeekPayments(classroomId: string, week: number): Promise<WeeklyPaymentRow[]> {
  const { data, error } = await supabase
    .from("weekly_payments")
    .select("id, student_id, week, amount, status, paid_at, recorded_by, students(id, student_id, prefix, first_name, last_name)")
    .eq("classroom_id", classroomId)
    .eq("week", week)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as WeeklyPaymentRow[];
}

export async function fetchOverdue(classroomId: string): Promise<WeeklyPaymentRow[]> {
  const { data, error } = await supabase
    .from("weekly_payments")
    .select("id, student_id, week, amount, status, paid_at, recorded_by, students(id, student_id, prefix, first_name, last_name)")
    .eq("classroom_id", classroomId)
    .eq("status", "unpaid")
    .order("week", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as WeeklyPaymentRow[];
}

export async function recordPayment(paymentId: string) {
  const { data, error } = await supabase.rpc("record_weekly_payment", { p_payment_id: paymentId });
  if (error) throw error;
  return data?.[0]?.new_balance as number;
}

export async function reversePayment(paymentId: string, reason: string) {
  const { data, error } = await supabase.rpc("reverse_weekly_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });
  if (error) throw error;
  return data?.[0]?.new_balance as number;
}

export async function recordMultiplePayments(paymentIds: string[]) {
  const { data, error } = await supabase.rpc("record_multiple_payments", { p_payment_ids: paymentIds });
  if (error) throw error;
  return data?.[0]?.new_balance as number;
}

export async function fetchMyPayments(classroomId: string, studentDbId: string): Promise<WeeklyPaymentRow[]> {
  const { data, error } = await supabase
    .from("weekly_payments")
    .select("id, student_id, week, amount, status, paid_at, recorded_by, students(id, student_id, prefix, first_name, last_name)")
    .eq("classroom_id", classroomId)
    .eq("student_id", studentDbId)
    .order("week", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as WeeklyPaymentRow[];
}

export async function fetchFundSummary(classroomId: string): Promise<FundSummary> {
  const { data, error } = await supabase.rpc("get_fund_summary", { p_classroom_id: classroomId });
  if (error) throw error;
  return data?.[0] as FundSummary;
}
