import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DmToolkitComponent } from './dm-toolkit.component';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection } from '@angular/core';
import { CommonModule } from '@angular/common';

describe('DmToolkitComponent', () => {
    let component: DmToolkitComponent;
    let fixture: ComponentFixture<DmToolkitComponent>;
    let httpMock: HttpTestingController;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [DmToolkitComponent, HttpClientTestingModule],
            providers: [provideZonelessChangeDetection()],
            schemas: [NO_ERRORS_SCHEMA]
        })
            .overrideComponent(DmToolkitComponent, {
                set: {
                    imports: [CommonModule],
                    schemas: [NO_ERRORS_SCHEMA] // Added this to suppress NG0304 in standalone component
                }
            })
            .compileComponents();

        fixture = TestBed.createComponent(DmToolkitComponent);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should create and load initial data', async () => {
        fixture.detectChanges(); // Trigger ngOnInit

        // Expect all the API calls
        const reqs = [
            '/codex/api/dm-toolkit/fights',
            '/codex/api/dm-toolkit/sessions',
            '/codex/api/codex/data',
            '/codex/api/admin/collections/entities_pf1e',
            '/codex/api/admin/collections/rules_pf1e',
            '/codex/api/admin/collections/equipment_pf1e',
            '/codex/api/admin/collections/magic_items_pf1e',
            '/codex/api/admin/collections/dm_toolkit_effects',
            '/codex/api/admin/collections/spells_pf1e'
        ];

        reqs.forEach(url => {
            const req = httpMock.expectOne(url);
            expect(req.request.method).toBe('GET');
            req.flush([]); // Flush empty arrays/objects
        });

        await fixture.whenStable();
        fixture.detectChanges();

        expect(component.fights()).toEqual([]);
        expect(component.sessions()).toEqual([]);
    });

    it('should update state on events', () => {
        // Manually call event handlers
        component.onFightAdded({ _id: 'f1' });
        expect(component.fights().length).toBe(1);

        component.onFightDeleted('f1');
        expect(component.fights().length).toBe(0);

        component.onSessionAdded({ _id: 's1' });
        expect(component.sessions().length).toBe(1);

        component.onSessionUpdated({ _id: 's1', name: 'Updated' });
        expect(component.sessions()[0].name).toBe('Updated');

        component.onSessionDeleted('s1');
        expect(component.sessions().length).toBe(0);
    });
});