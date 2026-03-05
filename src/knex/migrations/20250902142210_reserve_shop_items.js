export async function up(Knex) {
  await Knex.schema.createTable("reserve_shop_items", (table) => {
    table.increments("reserve_id").primary();
    table.string("reservation_id");
    table.integer("item_id");
    table.integer("item_quantity");
    table.integer("item_price");
    table.datetime("created_at").defaultTo(Knex.fn.now());
    table.datetime("updated_at").defaultTo(Knex.fn.now());
  });
}
export async function down(Knex) {
  await Knex.schema.dropTable("reserve_shop_items");
}
