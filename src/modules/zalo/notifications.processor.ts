import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NOTIFICATIONS } from '../../queue/queue.constants';
import { ZaloService, ZaloSendPayload } from './zalo.service';

/** Worker xử lý job gửi Zalo (retry tự động theo cấu hình BullMQ). */
@Processor(QUEUE_NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly zalo: ZaloService) {
    super();
  }

  async process(job: Job<ZaloSendPayload>): Promise<void> {
    await this.zalo.deliver(job.data);
    this.logger.log(`Đã gửi Zalo (job ${job.id})`);
  }
}
