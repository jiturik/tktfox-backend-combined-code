export async function up(Knex) {
  await Knex.schema.createTable("shop_categories", (table) => {
    table.increments("category_id").primary();
    table.string("category_name");
    table.enu("category_is_active", ["Y", "N"]).defaultTo("Y");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(Knex.fn.now());
    table.datetime("updated_at").defaultTo(Knex.fn.now());
  });

  await Knex.schema.createTable("shop_items", (table) => {
    table.increments("item_id").primary();
    table.string("item_name");
    table.string("item_unique_code");
    table.text("item_short_description");
    table.text("item_long_description");
    table.float("item_price");
    table.integer("item_category_id");
    table.integer("item_min_quantity");
    table.integer("item_max_quantity");
    table.integer("item_total_quantity");
    table.text("item_image");
    table.integer("item_order");
    table.enu("item_is_active", ["Y", "N"]).defaultTo("Y");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(Knex.fn.now());
    table.datetime("updated_at").defaultTo(Knex.fn.now());
  });
}
export async function down(Knex) {
  await Knex.schema.dropTable("shop_categories");
  await Knex.schema.dropTable("shop_items");
}
