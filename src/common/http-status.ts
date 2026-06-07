/**
 * Tập trung MỌI HTTP status code dùng trong app + message mặc định (tiếng Việt).
 * Dùng thay cho số literal / HttpStatus của NestJS để đồng nhất 1 nguồn.
 */
export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,

  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  GONE = 410,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,

  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
}

/** Message mặc định theo status code (dùng khi không có message cụ thể). */
export const HTTP_STATUS_MESSAGE: Record<number, string> = {
  [HttpStatusCode.OK]: 'Thành công',
  [HttpStatusCode.CREATED]: 'Đã tạo thành công',
  [HttpStatusCode.ACCEPTED]: 'Đã tiếp nhận',
  [HttpStatusCode.NO_CONTENT]: 'Không có nội dung',

  [HttpStatusCode.BAD_REQUEST]: 'Yêu cầu không hợp lệ',
  [HttpStatusCode.UNAUTHORIZED]: 'Chưa xác thực',
  [HttpStatusCode.FORBIDDEN]: 'Không có quyền truy cập',
  [HttpStatusCode.NOT_FOUND]: 'Không tìm thấy',
  [HttpStatusCode.METHOD_NOT_ALLOWED]: 'Phương thức không được hỗ trợ',
  [HttpStatusCode.CONFLICT]: 'Xung đột dữ liệu',
  [HttpStatusCode.GONE]: 'Tài nguyên không còn tồn tại',
  [HttpStatusCode.UNPROCESSABLE_ENTITY]: 'Dữ liệu không hợp lệ',
  [HttpStatusCode.TOO_MANY_REQUESTS]: 'Quá nhiều yêu cầu',

  [HttpStatusCode.INTERNAL_SERVER_ERROR]: 'Lỗi máy chủ',
  [HttpStatusCode.NOT_IMPLEMENTED]: 'Chưa hỗ trợ',
  [HttpStatusCode.BAD_GATEWAY]: 'Lỗi gateway',
  [HttpStatusCode.SERVICE_UNAVAILABLE]: 'Dịch vụ tạm thời không khả dụng',
  [HttpStatusCode.GATEWAY_TIMEOUT]: 'Gateway hết thời gian chờ',
};

/** Lấy message mặc định theo status (fallback an toàn). */
export const messageForStatus = (status: number): string =>
  HTTP_STATUS_MESSAGE[status] ?? 'Đã xử lý';
