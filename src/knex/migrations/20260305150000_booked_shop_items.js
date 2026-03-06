export async function up(knex) {
  await knex.schema.createTable("booked_shop_items", (table) => {
    table.increments("booked_id").primary();
    table.integer("reserve_id").unsigned();
    table.string("reservation_id");

    table.integer("item_id").unsigned();
    table.integer("item_quantity");
    table.integer("item_price");
    table.integer("total_price");

    table.string("customer_name");
    table.string("customer_email");
    table.string("customer_phone");
    table.text("customer_address");

    table
      .enu("delivery_status", [
        "PENDING",
        "PROCESSING",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
      ])
      .defaultTo("PENDING");

    table.text("notes");
    table.enu("is_active", ["Y", "N"]).defaultTo("Y");
    table.enu("email_sent", ["Y", "N"]).defaultTo("N");
    table.datetime("email_sent_at").nullable();
    table.datetime("delivered_at").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTable("booked_shop_items");
}
