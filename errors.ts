export function friendlyError(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? "";
  if (msg.includes("UNAUTHORIZED")) return "คุณไม่มีสิทธิ์เข้าถึงหน้านี้";
  if (msg.includes("ALREADY_PAID")) return "รายการนี้ถูกบันทึกว่าจ่ายแล้ว กรุณารีเฟรชหน้า";
  if (msg.includes("ALREADY_UNPAID")) return "รายการนี้ถูกยกเลิกแล้ว กรุณารีเฟรชหน้า";
  if (msg.includes("NOT_FOUND")) return "ไม่พบรายการนี้ในระบบ";
  if (msg.includes("NEGATIVE_BALANCE")) return "ยอดเงินกองกลางไม่เพียงพอ";
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
    return "การเชื่อมต่อมีปัญหา กรุณาตรวจสอบอินเทอร์เน็ต";
  }
  return "ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาลองใหม่";
}
