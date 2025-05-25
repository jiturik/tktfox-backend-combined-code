import 'knex';

async function up(knex) {
  await knex.schema.alterTable("pass_booking", (table) => {
    table.enu("is_active", ["Y", "N"]).defaultTo("Y");
    table.enu("email_sent", ["Y", "N"]).defaultTo("N");
  });
}
async function down(knex) {
  await knex.schema.alterTable("pass_booking", (table) => {
    table.dropColumn("is_active");
    table.dropColumn("email_sent");
  });
}

export { down, up };
