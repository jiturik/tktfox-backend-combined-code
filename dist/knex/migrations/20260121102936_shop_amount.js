async function up(knex) {
  await knex.schema.alterTable("ms_reservation", (table) => {
    table.float("shop_items_amount").defaultTo(0);
  });
}

async function down(knex) {
  await knex.schema.alterTable("ms_reservation", (table) => {
    table.dropColumn("shop_items_amount");
  });
}

export { down, up };
