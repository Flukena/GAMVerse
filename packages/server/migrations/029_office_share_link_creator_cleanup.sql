ALTER TABLE app_office_share_links
  DROP CONSTRAINT app_office_share_links_created_by_fkey,
  ADD CONSTRAINT app_office_share_links_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES app_users(username) ON DELETE CASCADE;
