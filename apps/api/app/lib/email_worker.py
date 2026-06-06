from __future__ import annotations

import asyncio
import logging

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.lib.mail import process_outbox_batch

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 30


async def email_worker_loop() -> None:
    settings = get_settings()
    logger.info("ENABLE_EMAIL_WORKER: email_outbox drain worker enabled")
    while True:
        try:
            async with AsyncSessionLocal() as db:
                count = await process_outbox_batch(db, settings=settings)
                if count:
                    logger.info("email_outbox processed %s message(s)", count)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("email_outbox worker tick failed")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
