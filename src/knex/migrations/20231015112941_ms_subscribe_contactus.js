export async function up(knex) {
  await knex.schema.alterTable("ms_subscriber", (table) => {
    table.string("subscriber_name").after("subscriber_email").defaultTo(null);
    table.string("subscriber_subject").after("subscriber_name").defaultTo(null);
    table
      .text("subscriber_message")
      .after("subscriber_subject")
      .defaultTo(null);
    table
      .enu("is_subscriber", ["Y", "N"])
      .after("subscriber_message")
      .defaultTo("Y");
  });
}
export async function down(knex) {
  await knex.schema.alterTable("ms_subscriber", (table) => {
    table.dropColumn("subscriber_name");
    table.dropColumn("subscriber_subject");
    table.dropColumn("subscriber_message");
    table.dropColumn("is_subscriber");
  });
}
