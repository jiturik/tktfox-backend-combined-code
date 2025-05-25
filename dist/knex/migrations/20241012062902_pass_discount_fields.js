import 'knex';

async function up(knex) {
  await knex.schema.alterTable("ms_reserve_pass", (table) => {
    table.float("pass_discount_percent").defaultTo(0);
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_reserve_pass", (table) => {
    table.dropColumn("pass_discount_percent");
  });
}

export { down, up };
