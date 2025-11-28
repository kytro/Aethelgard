import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingsComponent, ApiKeysDoc, GeneralSettingsDoc } from './settings.component';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';

describe('SettingsComponent', () => {
    let component: SettingsComponent;
    let fixture: ComponentFixture<SettingsComponent>;
    let httpMock: HttpTestingController;

    const mockKeys: ApiKeysDoc = { _id: 'api_keys', keys: [{ id: 'k1', name: 'Key1', key: 'xxx' }], active_key_id: 'k1' };
    const mockGeneral: GeneralSettingsDoc = { _id: 'general', default_ai_model: 'gemini-pro' };
    const mockModels = { models: ['gemini-pro', 'gemini-flash'] };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [SettingsComponent, HttpClientTestingModule],
            providers: [provideZonelessChangeDetection()]
        }).compileComponents();

        fixture = TestBed.createComponent(SettingsComponent);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);

        // loadAllSettings called in constructor - expects 3 parallel requests
        const keysReq = httpMock.expectOne('/codex/api/admin/settings/api-keys');
        const genReq = httpMock.expectOne('/codex/api/admin/settings/general');
        const modelsReq = httpMock.expectOne('/codex/api/ai-assistant/models');

        keysReq.flush(mockKeys);
        genReq.flush(mockGeneral);
        modelsReq.flush(mockModels);

        fixture.detectChanges();
        await fixture.whenStable();
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should load all settings', () => {
        expect(component.apiKeysDoc()).toEqual(mockKeys);
        expect(component.generalSettingsDoc()).toEqual(mockGeneral);
        expect(component.availableModels()).toEqual(mockModels.models);
    });

    it('should add api key', async () => {
        component.newKeyName.set('New Key');
        component.newKeyValue.set('123');

        component.addApiKey();

        const req = httpMock.expectOne('/codex/api/admin/settings/api-keys');
        expect(req.request.method).toBe('POST');
        req.flush({ id: 'k2', name: 'New Key', key: '123' });

        await fixture.whenStable();

        expect(component.apiKeysDoc()?.keys.length).toBe(2);
        expect(component.isDirty()).toBe(true);
    });

    it('should save settings', async () => {
        component.saveAllSettings();

        const reqActive = httpMock.expectOne('/codex/api/admin/settings/set-active');
        const reqGeneral = httpMock.expectOne('/codex/api/admin/settings/general');

        reqActive.flush({});
        reqGeneral.flush({});

        await fixture.whenStable();
        expect(component.message()?.text).toContain('saved successfully');
    });
});