import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE = 'response_message';

/** Đặt message tuỳ chỉnh cho response thành công. VD: @ResponseMessage('Đã trả hoa hồng') */
export const ResponseMessage = (message: string) => SetMetadata(RESPONSE_MESSAGE, message);
