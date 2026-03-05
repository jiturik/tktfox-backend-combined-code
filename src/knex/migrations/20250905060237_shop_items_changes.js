export async function up(knex) {
  await knex.schema.alterTable("reserve_shop_items", (table) => {
    table.enu("is_reserved", ["Y", "N"]).defaultTo("Y");
    table.enu("is_booked", ["Y", "N"]).defaultTo("N");
    table.integer("seat_release_time").defaultTo(15);
  });

  await knex.schema.alterTable("shop_items", (table) => {
    table.integer("item_reserved_quantity").defaultTo(0);
    table.integer("item_booked_quantity").defaultTo(0);
  });
}
export async function down(knex) {
  await knex.schema.alterTable("reserve_shop_items", (table) => {
    table.dropColumn("is_reserved");
    table.dropColumn("is_booked");
    table.dropColumn("seat_release_time");
  });
  await knex.schema.alterTable("shop_items", (table) => {
    table.dropColumn("item_reserved_quantity");
    table.dropColumn("item_booked_quantity");
  });
}
