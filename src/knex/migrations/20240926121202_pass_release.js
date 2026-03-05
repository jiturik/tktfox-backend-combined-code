export async function up(knex) {
  await knex.schema.alterTable("ms_pass_reservation", (table) => {
    table.integer("pass_release_time").defaultTo(10);
  });
}

export async function down(knex) {
  await knex.schema.alterTable("ms_pass_reservation", (table) => {
    table.dropColumn("pass_release_time");
  });
}
