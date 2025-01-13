import 'knex';

async function up(knex) {
  await knex.schema.alterTable("ms_customers", (table) => {
    table.enu("is_verified", ["Y", "N"]).defaultTo("N");
    table.string("email_otp");
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_customers", (table) => {
    table.dropColumn("is_verified");
    table.dropColumn("email_otp");
  });
}

export { down, up };
