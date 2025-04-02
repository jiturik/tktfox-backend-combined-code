import { CronJob } from 'cron';

{
  const job = new CronJob(
    "*/10 * * * * *", // Every 10 seconds
    async () => {
      console.log("Running CreateInvSendTicketEmail cron every 10 seconds");
      const { CreateInvSendTicketEmail } = await import(
        './server.js'
      ).then(function (n) { return n.C; });
      await CreateInvSendTicketEmail();
    },
    null,
    true
  );
  job.start();
}

{
  const job = new CronJob(
    "* * * * *", // Every minute
    async () => {
      console.log("Running CheckReleaseSeats cron every 1 minute");
      const { CheckReleaseSeats } = await import(
        './CheckReleaseSeats-TGsLhsnF.js'
      );
      await CheckReleaseSeats();
    },
    null,
    true
  );
  job.start();
}
