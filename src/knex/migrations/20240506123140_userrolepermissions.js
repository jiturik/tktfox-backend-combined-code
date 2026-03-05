export async function up(knex) {
  await knex.schema.alterTable("ms_roles", (table) => {
    table.dropColumn("role_permission");
  });
  await knex.schema.alterTable("users", (table) => {
    table.string("role_permission");
  });

  await knex.raw(
    `ALTER TABLE users CHANGE role_permission role_permission LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL`
  );
}

export async function down(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("role_permission");
  });
}
