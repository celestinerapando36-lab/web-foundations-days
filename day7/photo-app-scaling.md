# SnapShare: Scaling Plan

SnapShare is a photo-sharing app. Users upload photos and scroll a feed of photos from people they follow.

## 1. Assumptions

| Item                                    | Value                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------ |
| Registered users                        | 10,000,000                                                               |
| Daily active users (DAU)                | 10% of registered users                                                  |
| Uploads per active user per day         | 1 photo                                                                  |
| Feed page views per active user per day | 50                                                                       |
| Average photo size                      | 2 MB                                                                     |
| Thumbnail size                          | 50 KB (one per photo)                                                    |
| Seconds in a day                        | 86,400                                                                   |
| Peak traffic                            | 5x the average                                                           |
| Units                                   | 1 MB = 1,000,000 bytes, 1 TB = 1,000,000 MB (decimal, for round numbers) |

**Daily active users:** 10,000,000 x 10% = **1,000,000 DAU**

## 2. Estimates

### Uploads per second

- Uploads per day = 1,000,000 users x 1 photo = 1,000,000 photos/day
- Average = 1,000,000 / 86,400 = **about 11.6 uploads/s**
- Peak (5x) = **about 58 uploads/s**

### Feed views per second

- Feed views per day = 1,000,000 users x 50 = 50,000,000 views/day
- Average = 50,000,000 / 86,400 = **about 579 views/s**
- Peak (5x) = **about 2,900 views/s**

### Photo storage per year

- Per photo = 2 MB original + 0.05 MB thumbnail = 2.05 MB
- Per day = 1,000,000 x 2.05 MB = 2.05 TB/day
  - Originals: 2 TB/day
  - Thumbnails: 0.05 TB (50 GB)/day
- Per year = 2.05 TB x 365 = **about 748 TB, roughly 0.75 PB per year**
  - Originals: 730 TB/year
  - Thumbnails: 18.25 TB/year

### Upload bandwidth (extra check)

- Average = 11.6 x 2 MB = about 23 MB/s
- Peak = 58 x 2 MB = about 116 MB/s (roughly 0.9 Gbit/s)

### Summary

| Metric                | Average         | Peak (5x) |
| --------------------- | --------------- | --------- |
| Uploads per second    | 11.6            | 58        |
| Feed views per second | 579             | 2,900     |
| Photo storage         | 748 TB per year | -         |

## 3. Read-heavy or write-heavy?

**SnapShare is read-heavy.** Each user views 50 feed pages for every 1 photo they upload, so reads outnumber writes about **50 to 1** (579 views/s versus 11.6 uploads/s). In practice the gap is even larger, because one feed page shows many photos and each photo is fetched as an image file.

What this means for the design:

- **Cache aggressively.** Popular feed data and photo metadata are read over and over, so we keep them in a cache (e.g. Redis) instead of hitting the database every time.
- **Use a CDN.** Image files are served from servers close to the user, so most image traffic never reaches our servers.
- **Add read replicas.** Reads can be spread over copies of the database, while only one primary handles writes.
- **Keep the write path simple but safe.** Writes are few, so a single primary database is fine for a long time, but the heavy work (thumbnails) should not slow down the upload, so it goes to a queue.

## 4. Why photos must not be stored in the database

- **Size:** at about 750 TB per year, the database would become huge, slow to back up, slow to restore and expensive to replicate.
- **Cost:** database storage (fast disks, RAM for caching) costs far more per GB than object storage.
- **Performance:** big binary blobs fill the database's memory cache and slow down the small, fast queries (feed lists, follows, likes) that the database is good at.
- **Scaling:** a database is hard to scale to petabytes. Object storage is built to grow almost without limit and keeps copies of each file automatically.
- **Delivery:** files in object storage can be served directly through a CDN, but files inside a database would have to be fetched by an app server first.

**Where photos go instead:** into **object storage** (e.g. Amazon S3 or similar), with a CDN in front. The database stores only a small row of **metadata**: photo ID, owner ID, the object-storage key (path), upload time, status, and the thumbnail key.

## 5. Architecture diagram

```text
                          +-----------------------+
                          |   Users (web/mobile)  |
                          +-----------+-----------+
                                      |
              +-----------------------+------------------------+
              | (images: GET)                                   | (API: feed, upload requests)
              v                                                 v
     +-----------------+                              +------------------+
     |       CDN       |                              |  Load Balancer   |
     | (cached photos  |                              +--------+---------+
     |  and thumbnails)|                                       |
     +--------+--------+                      +----------------+----------------+
              | cache miss                    |                |                |
              |                               v                v                v
              |                         +-----------+    +-----------+    +-----------+
              |                         | App Server|    | App Server|    | App Server|
              |                         |     1     |    |     2     |    |     N     |
              |                         +--+-----+--+    +--+-----+--+    +--+-----+--+
              |                            |     |          |     |          |     |
              |         +------------------+     +----+-----+     +----------+     |
              |         |  (read first)              |                              |
              |         v                            |  (enqueue job)               |
              |   +-----------+                      v                              |
              |   |   Cache   |               +--------------+                      |
              |   |  (Redis)  |               |    Queue     |                      |
              |   +-----+-----+               | (thumbnail   |                      |
              |         | miss                |    jobs)     |                      |
              |         v                     +------+-------+                      |
              |   +-----------------------+          |                              |
              |   |   Database (Primary)  |          v                              |
              |   |   writes + metadata   |   +--------------+                      |
              |   +----------+------------+   |   Worker(s)  |                      |
              |              | replication    | make 50 KB   |                      |
              |              v                | thumbnails   |                      |
              |   +-----------------------+   +------+-------+                      |
              |   |   Read Replica(s)     |          |  read original               |
              |   |   serve feed reads    |          |  write thumbnail             |
              |   +-----------------------+          v                              |
              |                                +----------------------------------+   |
              +------------------------------->|        Object Storage            |<--+
                                               |  originals (2 MB) + thumbnails   |  (pre-signed
                                               |            (50 KB)               |   upload URL)
                                               +----------------------------------+
```

How to read it: API requests go through the load balancer to the app servers, which use the cache first, then the database (writes to the primary, feed reads from the replica). Photo files are never stored in the database. They live in object storage and are delivered to users via the CDN. Thumbnail jobs go through the queue to workers.

## 6. Components: one sentence each

- **CDN:** It solves slow and expensive image delivery by serving cached photos and thumbnails from servers close to the user, so most of the 2,900 peak views per second never reach our systems.
- **Load balancer:** It solves the problem of one server being overloaded or failing by spreading incoming requests across many app servers and skipping unhealthy ones.
- **App servers:** They solve the need to run the business logic (login, feed building, upload handling) and can be scaled out by simply adding more identical servers.
- **Cache (Redis):** It solves the problem of the database being hit by the same feed and metadata reads again and again by keeping hot data in fast memory.
- **Database (primary):** It solves the need for reliable, consistent storage of users, follows and photo metadata, and handles all writes.
- **Read replica:** It solves the problem of read traffic overloading the primary by holding a synced copy of the data that serves feed reads.
- **Object storage:** It solves the problem of storing hundreds of terabytes of photo files cheaply, durably and with practically unlimited growth.
- **Queue:** It solves the problem of slow background work blocking the upload by holding thumbnail jobs safely until a worker is free, and it absorbs spikes.
- **Worker:** It solves the problem of creating thumbnails without slowing down users by processing queued jobs in the background and scaling independently of the app servers.

## 7. Upload flow, step by step

1. The user picks a photo in the app and taps **Upload**.
2. The client sends an upload request to the API (through the load balancer) and an **app server** checks that the user is logged in and the file type and size are allowed.
3. The app server creates a **metadata row** in the **primary database** with the status `processing`, and gets a unique photo ID and an object key.
4. The app server returns a short-lived **pre-signed upload URL** for that key.
5. The client uploads the 2 MB photo **directly to object storage** using that URL (so the file does not pass through our app servers).
6. The client tells the app server the upload is finished (or object storage notifies us).
7. The app server puts a **"create thumbnail" job** (photo ID and object key) on the **queue** and immediately replies "upload successful" to the user.
8. A **worker** takes the job from the queue, downloads the original from object storage, and creates a **50 KB thumbnail**.
9. The worker saves the thumbnail to **object storage**.
10. The worker updates the database row to `ready` and stores the thumbnail key. It also clears or updates the related cache entries.
11. If the worker fails, the job returns to the queue and is retried. After several failures it goes to a dead-letter queue for investigation.
12. When followers load their feed, the app reads metadata (cache, then replica) and the browser fetches thumbnails and photos through the **CDN**.

## 8. Trade-offs

1. **Cache speed versus freshness (consistency).** Caching feeds makes them fast and protects the database, but users may briefly see stale data (e.g. a new photo appearing a few seconds late, or a deleted photo still showing). We accept short delays and use expiry times (TTLs) and cache invalidation on updates.
2. **Read replicas versus replication lag.** Replicas let us scale reads, but they copy data a little after the primary. A user might upload a photo and not see it on their own feed immediately. We can fix this by reading the user's own recent uploads from the primary or cache.
3. **Asynchronous thumbnails versus instant results.** Using a queue and workers keeps uploads fast and handles spikes, but the thumbnail is not available the instant the upload finishes. We show a placeholder or the status `processing` until the worker finishes. This also adds more moving parts (queue, workers, retries) to run and monitor.
4. **CDN cost and cache invalidation versus speed.** A CDN greatly reduces latency and load on our origin, but it costs money for bandwidth and makes it harder to remove or replace a photo quickly, because cached copies exist around the world.
5. **Direct-to-storage upload versus simplicity.** Pre-signed URLs take upload traffic (about 116 MB/s at peak) off our app servers, but the flow is more complex and we must check the file afterwards (type, size, malware) in the worker.
6. **Storing every photo forever versus cost.** At about 750 TB per year, storage cost grows constantly. We could move old, rarely viewed photos to cheaper storage tiers, at the price of slower access to them.
