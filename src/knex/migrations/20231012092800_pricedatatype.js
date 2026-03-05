export async function up(knex) {
  await knex.raw(
    `ALTER TABLE ms_seat_layout CHANGE price_data price_data LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL`
  );
}
export async function down(knex) {}
