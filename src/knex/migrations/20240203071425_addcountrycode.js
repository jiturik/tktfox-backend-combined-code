import 'knex';

async function up(knex) {
  await knex.schema.alterTable("ms_customers", (table) => {
    table.string("phone_county_code").after("phone_number");
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_customers", (table) => {
    table.dropColumn("phone_county_code");
  });
}

export { down, up };
