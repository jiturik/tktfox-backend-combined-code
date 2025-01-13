import 'knex';

async function up(knex) {
  await knex.schema.alterTable("ms_roles", (table) => {
    table.string("role_permission");
  });

  await knex.raw(
    `ALTER TABLE ms_roles CHANGE role_permission role_permission LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL`
  );
}

async function down(knex) {
  await knex.schema.alterTable("ms_roles", (table) => {
    table.dropColumn("role_permission");
  });
}

export { down, up };
