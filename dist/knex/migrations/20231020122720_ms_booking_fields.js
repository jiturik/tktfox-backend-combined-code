async function up(knex) {
  await knex.raw(
    `ALTER TABLE ms_booking CHANGE created_by created_by INT NULL DEFAULT NULL`
  );
}
async function down(knex) {}

export { down, up };
