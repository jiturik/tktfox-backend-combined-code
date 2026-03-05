export async function up(knex) {
  await knex.raw(
    `ALTER TABLE ms_booking CHANGE created_by created_by INT NULL DEFAULT NULL`
  );
}
export async function down(knex) {}
