CREATE INDEX "TrackerSeat_trackingYearId_isActive_idx" ON "TrackerSeat"("trackingYearId", "isActive");
CREATE INDEX "TrackerSeat_trackingYearId_sourceType_isActive_idx" ON "TrackerSeat"("trackingYearId", "sourceType", "isActive");
