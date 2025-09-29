async function up(knex) {
  await knex.schema.alterTable("movie_event_pass", (table) => {
    table.string("pass_email_content").nullable();
  });
  await knex.raw(
    `ALTER TABLE movie_event_pass CHANGE pass_email_content pass_email_content LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL`
  );
}
async function down(knex) {
  await knex.schema.alterTable("movie_event_pass", (table) => {
    table.dropColumn("pass_email_content");
  });
}

export { down, up };
