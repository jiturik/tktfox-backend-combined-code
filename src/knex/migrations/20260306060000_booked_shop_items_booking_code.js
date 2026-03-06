export async function up(knex) {
  await knex.schema.alterTable("booked_shop_items", (table) => {
    table.string("booking_code").nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("booked_shop_items", (table) => {
    table.dropColumn("booking_code");
  });
}

