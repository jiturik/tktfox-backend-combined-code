async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.enu("is_super_admin", ["Y", "N"]).defaultTo("N");
  });
}
async function down(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("is_super_admin");
  });
}

export { down, up };
