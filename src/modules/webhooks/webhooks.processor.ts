import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_WEBHOOKS } from '../../queue/queue.constants';
import { WebhooksService } from './webhooks.service';

/** Worker xử lý webhook nền (retry tự động). Idempotent nhờ dedup trong service. */
@Processor(QUEUE_WEBHOOKS)
export class WebhooksProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhooksProcessor.name);

  constructor(private readonly service: WebhooksService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'sepay') {
      const { status } = await this.service.handleSepay(job.data);
      this.logger.log(`Xử lý webhook sepay (job ${job.id}) → ${status}`);
    }
  }
}
