export async function up(knex) {
  await knex.raw(
    `ALTER TABLE organization_setting CHANGE setting_data setting_data LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL`
  );
}
export async function down(knex) {}
