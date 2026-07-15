## 1. Setup and Settings Registration

- [ ] 1.1 Register Devvit setting `enableFirstRunEvent` in `src/server/index.ts`
- [ ] 1.2 Implement moderator and setting helpers in `src/server/core/moderator.ts`

## 2. API Profile Override

- [ ] 2.1 Update `GET /api/profile` in `src/server/routes/meta.ts` to check setting/moderator status
- [ ] 2.2 Omit `onboardedAt` in profile response when forced first run is true

## 3. Testing and Verification

- [ ] 3.1 Create unit tests for moderator checking and settings retrieval
- [ ] 3.2 Verify local development environment with Redis mock setting
- [ ] 3.3 Run `openspec validate` and verify build succeeds
